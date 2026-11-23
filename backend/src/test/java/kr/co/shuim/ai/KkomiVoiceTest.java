package kr.co.shuim.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.ai.TodayDtos.Moment;
import kr.co.shuim.ai.TodayDtos.Request;
import kr.co.shuim.quote.PhilosophyQuoteService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class KkomiVoiceTest {
    private final ObjectMapper json = new ObjectMapper();
    private final TodayService service = new TodayService(mock(OpenAiClient.class), json, mock(PhilosophyQuoteService.class));

    private static Request request(String mode, String appearance, int affinity, String entry) {
        return new Request(mode, null, "2026-11-23", null, List.of(entry), null, null, null, null, null,
            Map.of("praise", "override"), "밤", appearance, affinity);
    }

    @Test void normalizesOptionalFieldsAndKeepsThemWhenAdminOverridesAreRemoved() throws Exception {
        Request legacy = json.readValue("{\"mode\":\"love\",\"companion\":\"꼬미\"}", Request.class).normalized();
        assertFalse(KkomiVoice.applies(legacy, false));
        Request cat = request("love", "kkomi", 900, "산책").withoutPrompts().normalized();
        assertTrue(cat.prompts().isEmpty());
        assertEquals(100, cat.companionAffinity().intValue());
        assertTrue(KkomiVoice.applies(cat, false));
        assertFalse(KkomiVoice.applies(cat, true));
        assertFalse(KkomiVoice.applies(request("review", "kkomi", 16, ""), false));
    }

    @Test void localPraiseAndLoveReflectEachBondStageAndKeepTodaysEvidence() {
        for (String mode : List.of("praise", "love")) {
            List<String> closings = List.of(0, 3, 8, 16).stream().map(points -> {
                Map<String, Object> result = service.run(request(mode, "kkomi", points, "산책"));
                assertEquals("local", result.get("source"));
                Moment moment = (Moment) result.get("moment");
                assertTrue(String.join(" ", moment.lines()).contains("산책"));
                return moment.closing();
            }).toList();
            assertEquals(4L, closings.stream().distinct().count());
        }
    }

    @Test void riskyRecordsKeepExistingSupportEvenWithAnEstablishedBond() {
        Request cat = request("love", "kkomi", 16, "죽고 싶어");
        Request other = request("love", "moru", 16, "죽고 싶어");
        Map<String, Object> result = service.run(cat);
        assertEquals(true, result.get("crisis"));
        assertEquals(service.run(other).get("moment"), result.get("moment"));
        assertTrue(((Moment) result.get("moment")).lines().getFirst().startsWith(Prompts.CRISIS_LINE));
    }
}
