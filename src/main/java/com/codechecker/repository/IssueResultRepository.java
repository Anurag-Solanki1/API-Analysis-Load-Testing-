package com.codechecker.repository;

import com.codechecker.entity.IssueResultEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
public interface IssueResultRepository extends JpaRepository<IssueResultEntity, Long> {
    List<IssueResultEntity> findByScanRunId(String scanRunId);
    List<IssueResultEntity> findByScanRunIdAndSeverity(String scanRunId, String severity);
    List<IssueResultEntity> findByScanRunIdAndCategory(String scanRunId, String category);
    List<IssueResultEntity> findByScanRunIdAndSource(String scanRunId, String source);
    long countByScanRunIdAndSeverity(String scanRunId, String severity);

    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM IssueResultEntity i WHERE i.scanRun.id = :scanRunId AND i.source = :source")
    void deleteByScanRunIdAndSource(String scanRunId, String source);
}
