package com.codechecker.repository;

import com.codechecker.entity.ScanRun;
import com.codechecker.model.ScanStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ScanRunRepository extends JpaRepository<ScanRun, String> {
    List<ScanRun> findAllByOrderByStartedAtDesc();
    List<ScanRun> findByStatus(ScanStatus status);
    List<ScanRun> findByProjectNameOrderByStartedAtDesc(String projectName);
}
