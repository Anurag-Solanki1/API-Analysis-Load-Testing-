package com.codechecker.service;

import com.codechecker.entity.GatewayHitEntity;
import com.codechecker.model.GatewayHit;
import com.codechecker.repository.GatewayHitRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

/**
 * Holds the in-memory ring buffer of the last 200 gateway hits per project,
 * broadcasts each hit to WebSocket subscribers, and persists hits to the DB
 * so they survive backend restarts.
 *
 * A scheduled job runs daily at 03:00 to delete records older than 7 days.
 */
@Service
public class GatewayMonitorService {

    private static final Logger log = LoggerFactory.getLogger(GatewayMonitorService.class);
    private static final int MAX_HITS_PER_PROJECT = 200;
    private static final int TTL_DAYS = 7;

    private final ConcurrentHashMap<String, Deque<GatewayHit>> recentHits = new ConcurrentHashMap<>();

    private final GatewayHitRepository hitRepository;
    private final ObjectMapper objectMapper;

    @Autowired
    @Lazy
    private SimpMessagingTemplate messagingTemplate;

    public GatewayMonitorService(GatewayHitRepository hitRepository, ObjectMapper objectMapper) {
        this.hitRepository = hitRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * Record a gateway hit: persist to DB, store in ring buffer, and broadcast via
     * WebSocket.
     */
    @Transactional
    public void record(String projectName, GatewayHit hit) {
        // Persist to DB
        try {
            GatewayHitEntity entity = toEntity(hit, projectName);
            hitRepository.save(entity);
        } catch (Exception e) {
            log.warn("Failed to persist gateway hit for {}: {}", projectName, e.getMessage());
        }

        // Keep in-memory ring buffer for live WebSocket feed
        Deque<GatewayHit> deque = recentHits.computeIfAbsent(projectName, k -> new ConcurrentLinkedDeque<>());
        deque.addFirst(hit);
        while (deque.size() > MAX_HITS_PER_PROJECT) {
            deque.pollLast();
        }
        try {
            messagingTemplate.convertAndSend("/topic/monitor/" + projectName, hit);
        } catch (Exception e) {
            log.warn("Failed to broadcast gateway hit for {}: {}", projectName, e.getMessage());
        }
    }

    /**
     * Return up to 200 most recent hits for a project, newest first.
     * Falls back to in-memory ring buffer if DB is unavailable.
     */
    @Transactional(readOnly = true)
    public List<GatewayHit> getRecent(String projectName) {
        try {
            List<GatewayHitEntity> entities = hitRepository.findTop200ByProjectNameOrderByRecordedAtDesc(projectName);
            if (!entities.isEmpty()) {
                return entities.stream().map(this::fromEntity).collect(Collectors.toList());
            }
        } catch (Exception e) {
            log.warn("Failed to query gateway hits from DB for {}: {}", projectName, e.getMessage());
        }
        // Fallback: in-memory buffer (e.g. first request after app start)
        Deque<GatewayHit> deque = recentHits.get(projectName);
        return deque != null ? new ArrayList<>(deque) : new ArrayList<>();
    }

    /**
     * Paginated history query. Optionally filter to a specific calendar day.
     *
     * @param projectName the project
     * @param page        0-based page index
     * @param size        rows per page (max 200)
     * @param date        optional – if provided, only hits from that day are returned
     */
    @Transactional(readOnly = true)
    public Page<GatewayHit> getHistory(String projectName, int page, int size, LocalDate date) {
        int safeSize = Math.min(size, 200);
        PageRequest pageRequest = PageRequest.of(page, safeSize);
        try {
            Page<GatewayHitEntity> entityPage;
            if (date != null) {
                LocalDateTime from = date.atStartOfDay();
                LocalDateTime to   = date.atTime(LocalTime.MAX);
                entityPage = hitRepository.findByProjectNameAndRecordedAtBetweenOrderByRecordedAtDesc(
                        projectName, from, to, pageRequest);
            } else {
                entityPage = hitRepository.findByProjectNameOrderByRecordedAtDesc(projectName, pageRequest);
            }
            List<GatewayHit> hits = entityPage.getContent().stream()
                    .map(this::fromEntity)
                    .collect(Collectors.toList());
            return new PageImpl<>(hits, pageRequest, entityPage.getTotalElements());
        } catch (Exception e) {
            log.warn("Failed to fetch history for {}: {}", projectName, e.getMessage());
            return Page.empty(pageRequest);
        }
    }

    /**
     * Return the total count of stored hits for a project.
     */
    @Transactional(readOnly = true)
    public long countHits(String projectName) {
        try {
            return hitRepository.countByProjectName(projectName);
        } catch (Exception e) {
            return 0;
        }
    }

    /**
     * Clear the in-memory ring buffer and DB records for a project.
     */
    @Transactional
    public void clear(String projectName) {
        recentHits.remove(projectName);
        try {
            hitRepository.deleteByProjectName(projectName);
        } catch (Exception e) {
            log.warn("Failed to clear gateway hits from DB for {}: {}", projectName, e.getMessage());
        }
    }

    /**
     * Daily cleanup at 03:00: deletes gateway_hits records older than 7 days
     * to keep the table from growing unbounded.
     */
    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void cleanupOldHits() {
        LocalDateTime cutoff = LocalDateTime.now().minusDays(TTL_DAYS);
        try {
            hitRepository.deleteByRecordedAtBefore(cutoff);
            log.info("Gateway hit TTL cleanup: deleted records older than {}", cutoff);
        } catch (Exception e) {
            log.warn("Gateway hit TTL cleanup failed: {}", e.getMessage());
        }
    }

    // ─── Mapping helpers ───────────────────────────────────────────────────────

    private GatewayHitEntity toEntity(GatewayHit hit, String projectName) {
        GatewayHitEntity e = new GatewayHitEntity();
        e.setProjectName(projectName);
        e.setMethod(hit.getMethod());
        e.setPath(hit.getPath());
        e.setStatusCode(hit.getStatusCode());
        e.setDurationMs(hit.getDurationMs());
        e.setHitTime(hit.getTime());
        e.setSource(hit.getSource());
        e.setRequestUrl(hit.getRequestUrl());
        e.setRequestBody(hit.getRequestBody());
        e.setResponseBody(hit.getResponseBody());
        e.setErrorMessage(hit.getErrorMessage());
        e.setRecordedAt(LocalDateTime.now());
        if (hit.getRequestHeaders() != null) {
            e.setRequestHeadersJson(toJson(hit.getRequestHeaders()));
        }
        if (hit.getResponseHeaders() != null) {
            e.setResponseHeadersJson(toJson(hit.getResponseHeaders()));
        }
        return e;
    }

    private GatewayHit fromEntity(GatewayHitEntity e) {
        GatewayHit hit = new GatewayHit();
        hit.setMethod(e.getMethod());
        hit.setPath(e.getPath());
        hit.setStatusCode(e.getStatusCode());
        hit.setDurationMs(e.getDurationMs());
        hit.setTime(e.getHitTime());
        hit.setProjectName(e.getProjectName());
        hit.setSource(e.getSource());
        hit.setRequestUrl(e.getRequestUrl());
        hit.setRequestBody(e.getRequestBody());
        hit.setResponseBody(e.getResponseBody());
        hit.setErrorMessage(e.getErrorMessage());
        if (e.getRequestHeadersJson() != null) {
            hit.setRequestHeaders(fromJson(e.getRequestHeadersJson()));
        }
        if (e.getResponseHeadersJson() != null) {
            hit.setResponseHeaders(fromJson(e.getResponseHeadersJson()));
        }
        return hit;
    }

    private String toJson(Map<String, String> map) {
        try {
            return objectMapper.writeValueAsString(map);
        } catch (Exception ex) {
            return null;
        }
    }

    private Map<String, String> fromJson(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, String>>() {
            });
        } catch (Exception ex) {
            return null;
        }
    }
}
