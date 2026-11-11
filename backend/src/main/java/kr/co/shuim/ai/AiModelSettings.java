package kr.co.shuim.ai;

import kr.co.shuim.config.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

@Service
public class AiModelSettings {
    private final JdbcClient jdbc;
    private final String defaultModel;

    public AiModelSettings(JdbcClient jdbc, @Value("${app.ai.model:gpt-6.1-terra}") String model) {
        this.jdbc = jdbc;
        defaultModel = Prompts.isAllowedModel(model) ? model : Prompts.DEFAULT_MODEL;
    }

    public String model() {
        return jdbc.sql("SELECT value FROM site_settings WHERE key = 'ai_model'")
            .query(String.class).optional().filter(Prompts::isAllowedModel).orElse(defaultModel);
    }

    public void save(String model) {
        if (!Prompts.isAllowedModel(model)) throw ApiException.badRequest("지원하는 GPT 모델을 선택해 주세요");
        jdbc.sql("""
            INSERT INTO site_settings (key, value, updated_at) VALUES ('ai_model', ?, ?)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
            """).param(model).param(LocalDateTime.now(ZoneOffset.UTC)).update();
    }
}
