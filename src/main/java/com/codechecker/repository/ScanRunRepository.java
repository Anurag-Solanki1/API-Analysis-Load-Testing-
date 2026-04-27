package com.codechecker.repository;

import com.codechecker.entity.ScanRun;
import com.codechecker.model.ScanStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ScanRunRepository extends JpaRepository<ScanRun, String> {
    List<ScanRun> findByUserOrderByStartedAtDesc(com.codechecker.entity.UserEntity user);
    List<ScanRun> findByStatus(ScanStatus status);
    List<ScanRun> findByUserAndProjectNameOrderByStartedAtDesc(com.codechecker.entity.UserEntity user, String projectName);
    List<ScanRun> findByIsPublicTrueOrderByStartedAtDesc();
}
