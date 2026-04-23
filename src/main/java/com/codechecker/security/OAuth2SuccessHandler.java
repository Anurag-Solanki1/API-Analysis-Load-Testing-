package com.codechecker.security;

import com.codechecker.entity.UserEntity;
import com.codechecker.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Handles successful Google OAuth2 login:
 * 1. Upserts the user in the database
 * 2. Generates a JWT
 * 3. Redirects to the frontend with the token
 */
@Component
public class OAuth2SuccessHandler implements AuthenticationSuccessHandler {

    private final UserRepository userRepository;
    private final JwtService jwtService;

    @Value("${app.frontend.url}")
    private String frontendUrl;

    public OAuth2SuccessHandler(UserRepository userRepository, JwtService jwtService) {
        this.userRepository = userRepository;
        this.jwtService = jwtService;
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication)
            throws IOException {

        OAuth2User oAuth2User = (OAuth2User) authentication.getPrincipal();

        String email = oAuth2User.getAttribute("email");
        String name = oAuth2User.getAttribute("name");
        String picture = oAuth2User.getAttribute("picture");

        // Upsert user
        UserEntity user = userRepository.findByEmail(email).orElseGet(() -> {
            UserEntity newUser = new UserEntity();
            newUser.setEmail(email);
            newUser.setProvider("GOOGLE");
            newUser.setRole("USER");
            newUser.setVerified(true); // Google verified
            return newUser;
        });

        user.setName(name);
        user.setPictureUrl(picture);
        if (user.getProvider() == null) user.setProvider("GOOGLE");
        userRepository.save(user);

        // Generate tokens and redirect to frontend
        String accessToken = jwtService.generateAccessToken(user);
        String refreshToken = jwtService.generateRefreshToken(user);
        response.sendRedirect(frontendUrl + "/login?token=" + accessToken + "&refreshToken=" + refreshToken);
    }
}
