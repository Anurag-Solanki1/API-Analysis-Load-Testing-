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
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

/**
 * Holds the in-memory ring buffer of the last 200 gateway hits per project,
 * broadcasts each hit to WebSocket subscribers, and persists hits to the DB
 * so they survive backend restarts.
 */
@Service
public class GatewayMonitorService {

    private static final Logger log = LoggerFactory.getLogger(GatewayMonitorService.class);
    private static final int MAX_HITS_PER_PROJECT = 200;

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
    public List<GatewayHit> getRecent(String projectName) {
        try {
            List<GatewayHitEntity> entities = hitRepository.findTop200ByProjectNameOrderByRecordedAtDesc(projectName);
            if (!entities.isEmpty()) {
                List<GatewayHit> hits = new ArrayList<>();
                for (GatewayHitEntity e : entities) {
                    hits.add(fromEntity(e));
                }
                return hits;
            }
        } catch (Exception e) {
            log.warn("Failed to query gateway hits from DB for {}: {}", projectName, e.getMessage());
        }
        // Fallback: in-memory buffer (e.g. first request after app start)
        Deque<GatewayHit> deque = recentHits.get(projectName);
        return deque != null ? new ArrayList<>(deque) : new ArrayList<>();
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
