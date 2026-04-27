package com.codechecker.repository;

import com.codechecker.entity.GatewayHitEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface GatewayHitRepository extends JpaRepository<GatewayHitEntity, Long> {

    /** Live feed: most recent 200 hits for a project. */
    List<GatewayHitEntity> findTop200ByUserAndProjectNameOrderByRecordedAtDesc(com.codechecker.entity.UserEntity user, String projectName);

    /** Paginated history: all hits for a project, newest first. */
    Page<GatewayHitEntity> findByUserAndProjectNameOrderByRecordedAtDesc(com.codechecker.entity.UserEntity user, String projectName, Pageable pageable);

    /** Paginated history filtered by a specific calendar day. */
    Page<GatewayHitEntity> findByUserAndProjectNameAndRecordedAtBetweenOrderByRecordedAtDesc(
            com.codechecker.entity.UserEntity user, String projectName, LocalDateTime from, LocalDateTime to, Pageable pageable);

    /** TTL cleanup: delete all hits older than the given cutoff timestamp. */
    void deleteByRecordedAtBefore(LocalDateTime cutoff);

    /** Count how many hits exist for a project (for stats). */
    long countByUserAndProjectName(com.codechecker.entity.UserEntity user, String projectName);

    void deleteByUserAndProjectName(com.codechecker.entity.UserEntity user, String projectName);
}
