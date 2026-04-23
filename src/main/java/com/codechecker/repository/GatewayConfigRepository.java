package com.codechecker.repository;

import com.codechecker.entity.GatewayConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface GatewayConfigRepository extends JpaRepository<GatewayConfigEntity, Long> {
    Optional<GatewayConfigEntity> findByProjectName(String projectName);
}
