package com.codechecker.repository;

import com.codechecker.entity.ApiLogEntryEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
public interface ApiLogEntryRepository extends JpaRepository<ApiLogEntryEntity, Long> {
    List<ApiLogEntryEntity> findByProjectNameAndEndpointPathAndHttpMethodOrderByTimestampDesc(String projectName,
            String endpointPath, String httpMethod);

    List<ApiLogEntryEntity> findByProjectNameOrderByTimestampAsc(String projectName);

    List<ApiLogEntryEntity> findByProjectNameAndImportBatchIdOrderByTimestampAsc(String projectName, String importBatchId);

    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM ApiLogEntryEntity e WHERE e.projectName = ?1")
    void deleteByProjectName(String projectName);

    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM ApiLogEntryEntity e WHERE e.importBatchId = ?1")
    void deleteByImportBatchId(String importBatchId);

    /** Returns [importBatchId, count, minTimestamp, maxTimestamp] rows for a project, newest-first. */
    @Query("SELECT e.importBatchId, COUNT(e), MIN(e.timestamp), MAX(e.timestamp) FROM ApiLogEntryEntity e " +
           "WHERE e.projectName = ?1 AND e.importBatchId IS NOT NULL " +
           "GROUP BY e.importBatchId ORDER BY MIN(e.timestamp) DESC")
    List<Object[]> findBatchSummariesByProjectName(String projectName);
}
