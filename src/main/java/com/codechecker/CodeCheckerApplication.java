package com.codechecker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class CodeCheckerApplication {
    public static void main(String[] args) {
        SpringApplication.run(CodeCheckerApplication.class, args);
    }
}
