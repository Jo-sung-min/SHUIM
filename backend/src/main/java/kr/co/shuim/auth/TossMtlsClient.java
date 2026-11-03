package kr.co.shuim.auth;

import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;

/** Shares the login PEM parser without exposing certificate/private-key material. */
public final class TossMtlsClient {
    private TossMtlsClient() {}

    public static RestClient create(RestClient.Builder builder, String cert, String key) {
        if (cert == null || cert.isBlank() || key == null || key.isBlank()) return null;
        try {
            HttpClient client = HttpClient.newBuilder()
                .sslContext(TossLoginService.sslContext(TossLoginService.pem(cert), TossLoginService.pem(key)))
                .connectTimeout(Duration.ofSeconds(8)).build();
            var factory = new JdkClientHttpRequestFactory(client);
            factory.setReadTimeout(Duration.ofSeconds(15));
            return builder.requestFactory(factory).build();
        } catch (Exception invalidCertificate) {
            return null;
        }
    }
}
