package kr.co.shuim.beach;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.util.Arrays;

/**
 * 서버에 하나뿐인 바닷가. 메모리에만 있어 인스턴스가 여럿이면 각자 다른 바닷가가 된다.
 * 샘플 방문자(바람·파도·조개)는 커뮤니티 샘플 답글과 같은 app.community.simulate 를 따르고, prod 프로필에서는 꺼진다.
 */
@Service
public class BeachService {
    private final BeachRoom room;

    public BeachService(Environment env, @Value("${app.community.simulate:true}") boolean simulate) {
        this.room = new BeachRoom(System::currentTimeMillis, simulate && !Arrays.asList(env.getActiveProfiles()).contains("prod"));
    }

    public BeachRoom room() { return room; }
}
