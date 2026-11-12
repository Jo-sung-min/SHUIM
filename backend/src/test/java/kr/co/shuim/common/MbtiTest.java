package kr.co.shuim.common;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class MbtiTest {
    @Test
    void keepsOnlyTheFourLetterTypes() {
        assertEquals("INFP", Mbti.normalize(" infp "));
        assertEquals("ESTJ", Mbti.normalize("ESTJ"));
        assertEquals("ENTP", Mbti.normalize("eNtP"));
        for (String wrong : new String[] {"", "   ", "INF", "INFPX", "ABCD", "NIFP", "IN-FP", "인프피"}) assertNull(Mbti.normalize(wrong), wrong);
        assertNull(Mbti.normalize(null));
    }
}
