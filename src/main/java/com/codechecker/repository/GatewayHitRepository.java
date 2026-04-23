package com.codechecker.repository;

import com.codechecker.entity.GatewayHitEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface GatewayHitRepository extends JpaRepository<GatewayHitEntity, Long> {
    List<GatewayHitEntity> findTop200ByProjectNameOrderByRecordedAtDesc(String projectName);

    void deleteByProjectName(String projectName);
}
