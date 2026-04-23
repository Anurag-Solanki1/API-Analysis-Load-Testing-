package com.codechecker.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class EmailService {

    private static final Logger logger = LoggerFactory.getLogger(EmailService.class);
    private final JavaMailSender mailSender;

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    public void sendOtpEmail(String toEmail, String otp) {
        String subject = "API Analyst - Your Verification Code";
        String body = "Welcome to API Analyst!\n\nYour verification code is: " + otp + "\n\nThis code will expire in 10 minutes.";

        // For local testing without SMTP configured, always log to console
        logger.info("\n\n================================================");
        logger.info("MOCK EMAIL SENT TO: {}", toEmail);
        logger.info("SUBJECT: {}", subject);
        logger.info("BODY:\n{}", body);
        logger.info("================================================\n\n");

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            // message.setFrom("noreply@apianalyst.com"); // Usually configured in properties
            message.setTo(toEmail);
            message.setSubject(subject);
            message.setText(body);
            mailSender.send(message);
            logger.info("Actual email sent successfully to {}", toEmail);
        } catch (Exception e) {
            logger.warn("Failed to send actual email (SMTP might not be configured). Check console logs for OTP.");
        }
    }
}
