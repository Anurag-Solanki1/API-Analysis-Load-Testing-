package com.codechecker.web;

import com.codechecker.entity.UserEntity;
import com.codechecker.repository.UserRepository;
import com.codechecker.security.JwtService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import com.codechecker.entity.EmailVerificationEntity;
import com.codechecker.repository.EmailVerificationRepository;
import com.codechecker.service.EmailService;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Random;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Authentication controller: local signup/login and user profile.
 * Google OAuth2 flow is handled by Spring Security + OAuth2SuccessHandler.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final EmailVerificationRepository emailVerificationRepo;
    private final EmailService emailService;

    public AuthController(UserRepository userRepository,
                          JwtService jwtService,
                          PasswordEncoder passwordEncoder,
                          EmailVerificationRepository emailVerificationRepo,
                          EmailService emailService) {
        this.userRepository = userRepository;
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
        this.emailVerificationRepo = emailVerificationRepo;
        this.emailService = emailService;
    }

    // ── POST /api/auth/signup ───────────────────────────────────────────
    @PostMapping("/signup")
    public ResponseEntity<?> signup(@RequestBody SignupRequest req) {
        if (req.email == null || req.email.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
        
        if (req.password == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Password is required"));
        }
        
        // Password strength validation
        String passwordRegex = "^(?=.*[a-z])(?=.*[A-Z])(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$";
        if (!req.password.matches(passwordRegex)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Password must be at least 8 characters long, and contain at least one uppercase letter, one lowercase letter, and one special character"));
        }

        if (userRepository.existsByEmail(req.email.trim().toLowerCase())) {
            return ResponseEntity.status(409).body(Map.of("error", "An account with this email already exists"));
        }

        UserEntity user = new UserEntity();
        user.setEmail(req.email.trim().toLowerCase());
        user.setName(req.name != null ? req.name.trim() : req.email.split("@")[0]);
        user.setPasswordHash(passwordEncoder.encode(req.password));
        user.setProvider("LOCAL");
        user.setRole("USER");
        user.setVerified(false);
        userRepository.save(user);

        sendOtp(user.getEmail());

        return ResponseEntity.ok(Map.of("message", "OTP sent to email", "requireOtp", true));
    }

    // ── POST /api/auth/verify-otp ───────────────────────────────────────
    @PostMapping("/verify-otp")
    public ResponseEntity<?> verifyOtp(@RequestBody VerifyOtpRequest req) {
        if (req.email == null || req.otp == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email and OTP are required"));
        }

        String email = req.email.trim().toLowerCase();
        var optVerif = emailVerificationRepo.findByEmail(email);
        
        if (optVerif.isEmpty() || !optVerif.get().getOtp().equals(req.otp.trim())) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid OTP"));
        }

        if (optVerif.get().getExpiresAt().isBefore(Instant.now())) {
            return ResponseEntity.status(401).body(Map.of("error", "OTP has expired. Please request a new one."));
        }

        var optUser = userRepository.findByEmail(email);
        if (optUser.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "User not found"));

        UserEntity user = optUser.get();
        user.setVerified(true);
        userRepository.save(user);
        emailVerificationRepo.delete(optVerif.get());

        String accessToken = jwtService.generateAccessToken(user);
        String refreshToken = jwtService.generateRefreshToken(user);
        return ResponseEntity.ok(buildAuthResponse(user, accessToken, refreshToken));
    }

    // ── POST /api/auth/resend-otp ───────────────────────────────────────
    @PostMapping("/resend-otp")
    public ResponseEntity<?> resendOtp(@RequestBody ResendOtpRequest req) {
        if (req.email == null) return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
        String email = req.email.trim().toLowerCase();
        
        if (userRepository.findByEmail(email).isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "User not found"));
        }
        
        sendOtp(email);
        return ResponseEntity.ok(Map.of("message", "A new OTP has been sent"));
    }

    // ── POST /api/auth/login ────────────────────────────────────────────
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest req) {
        if (req.email == null || req.password == null)
            return ResponseEntity.badRequest().body(Map.of("error", "Email and password are required"));

        var optUser = userRepository.findByEmail(req.email.trim().toLowerCase());
        if (optUser.isEmpty()) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid email or password"));
        }

        UserEntity user = optUser.get();

        if (user.getPasswordHash() == null || user.getPasswordHash().isEmpty()) {
            return ResponseEntity.status(401)
                    .body(Map.of("error", "This account uses Google login. Please sign in with Google."));
        }

        if (!passwordEncoder.matches(req.password, user.getPasswordHash())) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid email or password"));
        }

        if (!user.isVerified()) {
            sendOtp(user.getEmail());
            return ResponseEntity.status(403).body(Map.of("error", "Email not verified", "requireOtp", true));
        }

        String accessToken = jwtService.generateAccessToken(user);
        String refreshToken = jwtService.generateRefreshToken(user);
        return ResponseEntity.ok(buildAuthResponse(user, accessToken, refreshToken));
    }

    // ── GET /api/auth/me ────────────────────────────────────────────────
    @GetMapping("/me")
    public ResponseEntity<?> me(@AuthenticationPrincipal UserEntity user) {
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Not authenticated"));
        }
        return ResponseEntity.ok(buildUserProfile(user));
    }

    // ── POST /api/auth/refresh-token ────────────────────────────────────
    @PostMapping("/refresh-token")
    public ResponseEntity<?> refreshToken(@RequestBody RefreshTokenRequest req) {
        if (req.refreshToken == null || !jwtService.isTokenValid(req.refreshToken)) {
            return ResponseEntity.status(401).body(Map.of("error", "Invalid or expired refresh token"));
        }

        String email = jwtService.extractEmail(req.refreshToken);
        var optUser = userRepository.findByEmail(email);
        if (optUser.isEmpty()) {
            return ResponseEntity.status(401).body(Map.of("error", "User not found"));
        }

        UserEntity user = optUser.get();
        String newAccessToken = jwtService.generateAccessToken(user);
        String newRefreshToken = jwtService.generateRefreshToken(user);

        return ResponseEntity.ok(buildAuthResponse(user, newAccessToken, newRefreshToken));
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    private void sendOtp(String email) {
        String otp = String.format("%06d", new Random().nextInt(999999));
        var optVerif = emailVerificationRepo.findByEmail(email);
        EmailVerificationEntity verif = optVerif.orElseGet(EmailVerificationEntity::new);
        
        verif.setEmail(email);
        verif.setOtp(otp);
        verif.setExpiresAt(Instant.now().plus(10, ChronoUnit.MINUTES));
        emailVerificationRepo.save(verif);

        emailService.sendOtpEmail(email, otp);
    }

    private Map<String, Object> buildAuthResponse(UserEntity user, String accessToken, String refreshToken) {
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("token", accessToken);
        res.put("refreshToken", refreshToken);
        res.put("user", buildUserProfile(user));
        return res;
    }

    private Map<String, Object> buildUserProfile(UserEntity user) {
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("id", user.getId());
        profile.put("email", user.getEmail());
        profile.put("name", user.getName());
        profile.put("picture", user.getPictureUrl());
        profile.put("provider", user.getProvider());
        profile.put("role", user.getRole());
        return profile;
    }

    // ── Request DTOs ────────────────────────────────────────────────────

    public static class SignupRequest {
        public String email;
        public String password;
        public String name;
    }

    public static class LoginRequest {
        public String email;
        public String password;
    }

    public static class VerifyOtpRequest {
        public String email;
        public String otp;
    }

    public static class ResendOtpRequest {
        public String email;
    }

    public static class RefreshTokenRequest {
        public String refreshToken;
    }
}
