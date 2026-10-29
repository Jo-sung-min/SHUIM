package kr.co.shuim.circle;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.Properties;

/**
 * 소속 인증 메일. SMTP_HOST 가 있을 때만 보낸다 (Spring 의 자동 설정 대신 직접 만들어 빈 값일 때 꺼 둔다).
 * 설정이 없으면 configured() 가 false 이고, 개발 환경(prod 프로필이 아닐 때)에서는 호출자가 코드를 화면에 보여 준다.
 */
@Service
public class MailService {
    private static final Logger log = LoggerFactory.getLogger(MailService.class);
    private final JavaMailSenderImpl sender;
    private final String from;
    private final boolean prod;

    public MailService(@Value("${app.mail.host:}") String host, @Value("${app.mail.port:587}") int port,
                       @Value("${app.mail.username:}") String username, @Value("${app.mail.password:}") String password,
                       @Value("${app.mail.from:no-reply@sorow.co.kr}") String from, Environment env) {
        this.from = from;
        this.prod = Arrays.asList(env.getActiveProfiles()).contains("prod");
        if (host == null || host.isBlank()) {
            this.sender = null;
            return;
        }
        JavaMailSenderImpl s = new JavaMailSenderImpl();
        s.setHost(host.strip());
        s.setPort(port);
        if (!username.isBlank()) s.setUsername(username.strip());
        if (!password.isBlank()) s.setPassword(password);
        Properties p = s.getJavaMailProperties();
        p.put("mail.smtp.auth", String.valueOf(!username.isBlank()));
        p.put("mail.smtp.starttls.enable", "true");
        p.put("mail.smtp.connectiontimeout", "10000");
        p.put("mail.smtp.timeout", "10000");
        this.sender = s;
    }

    public boolean configured() { return sender != null; }

    /** 개발 환경에서 메일 대신 코드를 화면에 보여 줘도 되는지 */
    public boolean devFallback() { return sender == null && !prod; }

    public void sendCode(String to, String circleName, String code) {
        if (sender == null) throw new IllegalStateException("메일 설정 전");
        SimpleMailMessage m = new SimpleMailMessage();
        m.setFrom(from);
        m.setTo(to);
        m.setSubject("[소로우] " + circleName + " 인증 코드 " + code);
        m.setText(circleName + " 멤버 인증 코드는 " + code + " 예요.\n10분 안에 소로우 화면에 입력해 주세요.\n\n"
            + "이 메일 주소는 저장하지 않고, 소속 확인에만 써요. 요청하지 않았다면 이 메일은 무시해 주세요.");
        sender.send(m);
        log.info("circle verification mail sent for {}", circleName);
    }
}
