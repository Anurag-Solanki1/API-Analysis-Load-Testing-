package com.codechecker.security;

import com.codechecker.entity.UserEntity;
import com.codechecker.repository.UserRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.Optional;

@Component
public class SecurityUtils {

    private final UserRepository userRepository;

    public SecurityUtils(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /**
     * Gets the currently authenticated user from the SecurityContext.
     * Throws an exception if the user is not authenticated or not found in the database.
     */
    public UserEntity getCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getPrincipal() == null) {
            throw new RuntimeException("User is not authenticated");
        }

        Object principal = auth.getPrincipal();
        String email = null;
        if (principal instanceof UserEntity) {
            email = ((UserEntity) principal).getEmail();
        } else if (principal instanceof org.springframework.security.oauth2.core.user.OAuth2User) {
            email = ((org.springframework.security.oauth2.core.user.OAuth2User) principal).getAttribute("email");
        } else if (principal instanceof String) {
            email = (String) principal;
        } else {
            // Fallback for unexpected Principal formats
            email = principal.toString();
            if (email.contains("email=")) {
                int start = email.indexOf("email=") + 6;
                int end = email.indexOf(",", start);
                if (end == -1) end = email.indexOf("}", start);
                if (end != -1) email = email.substring(start, end).trim();
            }
        }
        
        if (email == null) {
            throw new RuntimeException("Could not extract email from Principal: " + principal);
        }

        final String finalEmail = email;
        return userRepository.findByEmail(finalEmail)
                .orElseThrow(() -> new RuntimeException("User not found with email: " + finalEmail));
    }
    
    /**
     * Helper to safely get current user, returns empty optional if unauthenticated.
     */
    public Optional<UserEntity> getCurrentUserOptional() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getPrincipal() == null || "anonymousUser".equals(auth.getPrincipal())) {
            return Optional.empty();
        }
        
        Object principal = auth.getPrincipal();
        String email = null;
        if (principal instanceof UserEntity) {
            email = ((UserEntity) principal).getEmail();
        } else if (principal instanceof org.springframework.security.oauth2.core.user.OAuth2User) {
            email = ((org.springframework.security.oauth2.core.user.OAuth2User) principal).getAttribute("email");
        } else if (principal instanceof String) {
            email = (String) principal;
        } else {
            email = principal.toString();
            if (email.contains("email=")) {
                int start = email.indexOf("email=") + 6;
                int end = email.indexOf(",", start);
                if (end == -1) end = email.indexOf("}", start);
                if (end != -1) email = email.substring(start, end).trim();
            }
        }
        
        if (email == null) return Optional.empty();
        return userRepository.findByEmail(email);
    }
    
    /**
     * Checks if the current authenticated user has permission to access the given scan.
     * Access is granted if the scan is public OR if the user is the owner of the scan.
     */
    public boolean canAccessScan(com.codechecker.entity.ScanRun scan) {
        if (scan.isPublic()) return true;
        Optional<UserEntity> userOpt = getCurrentUserOptional();
        if (userOpt.isEmpty()) return false;
        return scan.getUser().getId().equals(userOpt.get().getId());
    }
}
