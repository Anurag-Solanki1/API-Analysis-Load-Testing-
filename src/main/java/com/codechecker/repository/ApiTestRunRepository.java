package com.codechecker.repository;

import com.codechecker.entity.ApiTestRunEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ApiTestRunRepository extends JpaRepository<ApiTestRunEntity, String> {
    List<ApiTestRunEntity> findByUserAndProjectNameAndEndpointPathAndHttpMethodOrderByStartedAtDesc(
            com.codechecker.entity.UserEntity user, String projectName, String endpointPath, String httpMethod);
}
