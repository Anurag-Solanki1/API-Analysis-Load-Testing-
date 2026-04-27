package com.codechecker.repository;

import com.codechecker.entity.GatewayConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface GatewayConfigRepository extends JpaRepository<GatewayConfigEntity, Long> {
    Optional<GatewayConfigEntity> findByUserAndProjectName(com.codechecker.entity.UserEntity user, String projectName);
    Optional<GatewayConfigEntity> findByUser_EmailAndProjectName(String email, String projectName);
}
