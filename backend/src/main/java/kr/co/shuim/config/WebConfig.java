package kr.co.shuim.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Arrays;

/** 프론트(Next)는 보통 같은 출처에서 /api 를 프록시하지만, 직접 호출할 때를 위해 CORS 도 열어둔다 (쿠키 포함) */
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Value("${app.origin}") private String origin;
    @Value("${app.allowed-origins:${app.origin}}") private String allowedOrigins;

    @Override public void addCorsMappings(CorsRegistry registry) {
        String[] origins = Arrays.stream((allowedOrigins + "," + origin).split(","))
            .map(String::trim).filter(o -> !o.isBlank()).distinct().toArray(String[]::new);
        registry.addMapping("/api/**")
            .allowedOrigins(origins)
            .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
            .allowedHeaders("Content-Type")
            .allowCredentials(true);
    }
}
