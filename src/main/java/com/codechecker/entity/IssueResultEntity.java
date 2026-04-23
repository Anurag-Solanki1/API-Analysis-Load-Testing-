package com.codechecker.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "issue_results")
public class IssueResultEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "scan_run_id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private ScanRun scanRun;

    private String ruleId;
    private String severity;
    private String title;

    @Column(length = 2000)
    private String description;

    private String file;
    private Integer lineNumber;

    @Column(length = 2000)
    private String beforeCode;

    @Column(length = 2000)
    private String afterCode;

    private Boolean autoFixed;
    private String affectedEndpoint;
    private String category;

    /** "STATIC" = found by static analyzer; "AI_AGENT" = found by Copilot agent */
    private String source = "STATIC";

    public IssueResultEntity() {}

    // Getters and setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public ScanRun getScanRun() { return scanRun; }
    public void setScanRun(ScanRun scanRun) { this.scanRun = scanRun; }

    public String getRuleId() { return ruleId; }
    public void setRuleId(String ruleId) { this.ruleId = ruleId; }

    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getFile() { return file; }
    public void setFile(String file) { this.file = file; }

    public Integer getLineNumber() { return lineNumber; }
    public void setLineNumber(Integer lineNumber) { this.lineNumber = lineNumber; }

    public String getBeforeCode() { return beforeCode; }
    public void setBeforeCode(String beforeCode) { this.beforeCode = beforeCode; }

    public String getAfterCode() { return afterCode; }
    public void setAfterCode(String afterCode) { this.afterCode = afterCode; }

    public Boolean getAutoFixed() { return autoFixed; }
    public void setAutoFixed(Boolean autoFixed) { this.autoFixed = autoFixed; }

    public String getAffectedEndpoint() { return affectedEndpoint; }
    public void setAffectedEndpoint(String affectedEndpoint) { this.affectedEndpoint = affectedEndpoint; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
}
