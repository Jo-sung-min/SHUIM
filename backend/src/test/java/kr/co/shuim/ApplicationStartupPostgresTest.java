package kr.co.shuim;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;

import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * 앱 전체가 실제로 뜨는지 확인한다 (빈 생성·생성자 선택·필터 등록·Flyway).
 * 다른 테스트는 클래스를 직접 만들어 쓰므로, 생성자가 둘인 빈에 @Autowired 가 빠지는 식의
 * "테스트는 다 통과하는데 서버가 안 뜨는" 실수를 여기서 잡는다 (2026-11-17 AiQuota·DbHealthController·SiteSettingsService).
 */
@EnabledIfEnvironmentVariable(named = "SOROW_TEST_DATABASE_URL", matches = "jdbc:postgresql://127\\.0\\.0\\.1:[0-9]+/sorow_test")
@SpringBootTest(properties = {
    "app.db.url=${SOROW_TEST_DATABASE_URL}?user=sorow_test",
    "app.community.simulate=false",
})
class ApplicationStartupPostgresTest {
    @Autowired
    ApplicationContext context;

    @Test
    void wholeApplicationStarts() {
        assertNotNull(context.getBean(kr.co.shuim.ai.AiController.class));
        assertNotNull(context.getBean(kr.co.shuim.config.DbHealthController.class));
        assertNotNull(context.getBean(kr.co.shuim.site.SiteSettingsService.class));
        assertNotNull(context.getBean(kr.co.shuim.auth.AuthService.class));
    }
}
