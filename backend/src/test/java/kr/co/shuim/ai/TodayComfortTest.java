package kr.co.shuim.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.ai.MbtiComfortService.Guide;
import kr.co.shuim.ai.TodayDtos.*;
import kr.co.shuim.quote.PhilosophyQuoteService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** MBTI별 위로 방향 (V51): 칭찬받기·사랑받기의 지침으로만, 기록과 위기 안내보다 뒤에 붙는다 */
class TodayComfortTest {
    private final OpenAiClient ai = mock(OpenAiClient.class);
    private final PhilosophyQuoteService quotes = mock(PhilosophyQuoteService.class);
    private final TodayService service = new TodayService(ai, new ObjectMapper(), quotes);
    private static final Guide GUIDE = new Guide("방향-표시", "칭찬-표시", "사랑-표시", "피할것-표시");
    private static final Pattern TYPE_NAME = Pattern.compile("(?<![A-Za-z])[EI][SN][TF][JP](?![A-Za-z])");

    private Request request(String mode, String note, Map<String, String> prompts) {
        return new Request(mode, null, "2026-11-04", Map.of("mind", new Entry(2, null, note)), List.of("오늘 산책"),
            List.of(), List.of(), List.of(), List.of(), List.of(), prompts, null);
    }

    /** AI 에 건넨 시스템 프롬프트 */
    private String system(String mode, String note, Map<String, String> prompts, Guide guide) {
        reset(ai);
        when(quotes.randomApproved()).thenReturn(Optional.empty());
        when(ai.configured()).thenReturn(true);
        when(ai.resolveModel(any())).thenReturn("test-model");
        when(ai.complete(anyString(), anyInt(), anyString(), anyString())).thenReturn(switch (mode) {
            case "briefing" -> "{\"headline\":\"h\",\"momentum\":{\"text\":\"m\",\"direction\":\"flat\"},\"highlights\":[]}";
            case "review" -> "{\"headline\":\"h\",\"cautions\":[],\"changes\":[]}";
            default -> "{\"title\":\"t\",\"lines\":[\"하나\",\"둘\",\"셋\"],\"closing\":\"c\"}";
        });
        Map<String, Object> result = guide == null ? service.run(request(mode, note, prompts)) : service.run(request(mode, note, prompts), guide);
        assertEquals("ai", result.get("source"));
        ArgumentCaptor<String> captured = ArgumentCaptor.forClass(String.class);
        verify(ai).complete(anyString(), anyInt(), captured.capture(), anyString());
        return captured.getValue();
    }

    @Test
    void praiseAndLoveEachReceiveTheDirectionWithTheirOwnHint() {
        String praise = system("praise", "오늘은 마음이 편안해", Map.of(), GUIDE);
        assertTrue(praise.contains("방향-표시") && praise.contains("칭찬-표시") && praise.contains("피할것-표시"));
        assertFalse(praise.contains("사랑-표시"));
        String love = system("love", "오늘은 마음이 편안해", Map.of(), GUIDE);
        assertTrue(love.contains("방향-표시") && love.contains("사랑-표시") && love.contains("피할것-표시"));
        assertFalse(love.contains("칭찬-표시"));
        // 기록이 먼저라는 규칙과 함께 건넨다
        assertTrue(love.contains("오늘 기록에 드러난 마음이 언제나 먼저"));
        assertTrue(love.contains("기록에 없는 일을 이 지침으로 지어내지 마"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"briefing", "review"})
    void otherModesNeverReceiveIt(String mode) {
        assertFalse(system(mode, "오늘은 마음이 편안해", Map.of(), GUIDE).contains("방향-표시"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"praise", "love"})
    void aDayWithACrisisSignalKeepsTheHelplineRulesWithoutTheGuide(String mode) {
        String prompt = system(mode, "다 그만두고 죽고 싶어", Map.of(), GUIDE);
        assertFalse(prompt.contains("방향-표시"));
        assertTrue(prompt.contains("109"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"praise", "love"})
    void withoutAGuideThePromptIsWhatItWasBefore(String mode) {
        String before = system(mode, "오늘은 마음이 편안해", Map.of(), null);
        assertFalse(before.contains("위로받고 싶어 하는 방향"));
        assertEquals(before + "\n\n" + Prompts.comfort("방향-표시", "praise".equals(mode) ? "칭찬-표시" : "사랑-표시", "피할것-표시"),
            system(mode, "오늘은 마음이 편안해", Map.of(), GUIDE));
    }

    @Test
    void theGuideSurvivesAnAdministratorOverrideAndNeverNamesAType() {
        String prompt = system("praise", "오늘은 마음이 편안해", Map.of("praise", "관리자 말투 지침"), GUIDE);
        assertTrue(prompt.startsWith("관리자 말투 지침"));
        assertTrue(prompt.contains("방향-표시"));
        assertTrue(prompt.contains("MBTI·유형 이름"));
        assertFalse(TYPE_NAME.matcher(prompt).find(), "the four letters are never sent to the model");
    }

    @Test
    void longOrMissingTextFromTheTableIsBounded() {
        String prompt = Prompts.comfort("가".repeat(1000), null, "  줄\n바꿈   여러 칸  ");
        assertTrue(prompt.contains("가".repeat(Prompts.COMFORT_MAX)));
        assertFalse(prompt.contains("가".repeat(Prompts.COMFORT_MAX + 1)));
        assertTrue(prompt.contains("- 이렇게 건네면 닿아: \n"));
        assertTrue(prompt.contains("- 피할 것: 줄 바꿈 여러 칸\n"));
    }

    @Test
    void theSeedHasEveryTypeOnceAndNothingLongEnoughToBeCut() throws IOException {
        String sql;
        try (InputStream in = getClass().getResourceAsStream("/db/migration/V51__mbti_comfort.sql")) {
            assertNotNull(in, "V51 migration is on the classpath");
            sql = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        String rows = sql.substring(sql.indexOf("INSERT INTO mbti_comfort_guides"));
        List<String> types = new ArrayList<>();
        Matcher row = Pattern.compile("\\('([EI][SN][TF][JP])',").matcher(rows);
        while (row.find()) types.add(row.group(1));
        Set<String> all = new TreeSet<>();
        for (char e : "EI".toCharArray()) for (char s : "SN".toCharArray()) for (char t : "TF".toCharArray()) for (char j : "JP".toCharArray()) all.add("" + e + s + t + j);
        assertEquals(16, types.size());
        assertEquals(all, new TreeSet<>(types));
        Matcher text = Pattern.compile("'([^']*)'").matcher(rows);
        int texts = 0;
        while (text.find()) {
            if (all.contains(text.group(1))) continue;
            texts++;
            assertFalse(text.group(1).isBlank());
            assertTrue(text.group(1).length() <= Prompts.COMFORT_MAX, text.group(1));
        }
        assertEquals(16 * 4, texts, "direction, praise, love and avoid for every type");
    }
}
