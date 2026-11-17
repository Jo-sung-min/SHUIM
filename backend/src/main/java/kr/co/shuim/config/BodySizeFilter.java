package kr.co.shuim.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Set;

/**
 * /api/** 요청 본문 크기 상한 (ABUSE-04). Content-Length 가 넘으면 읽기 전에 413 으로 끊고,
 * 길이 없이 오는 chunked 본문은 읽는 만큼 세다가 넘으면 예외로 멈춘다(핸들러가 413 으로 바꾼다).
 * 관리자 이미지(공유 이미지 1MB·파비콘 300KB 를 base64 로 한 번에)와 기록 가져오기는 더 큰 한도를 쓴다.
 */
public class BodySizeFilter extends OncePerRequestFilter {
    static final String MESSAGE = "보낼 내용이 너무 커요.";

    /** 본문이 한도를 넘었을 때 (ApiExceptionHandler 가 413 으로 바꾼다) */
    public static class TooLarge extends IOException {
        public TooLarge() { super("request body too large"); }
    }

    private final long maxBytes;
    private final long largeMaxBytes;
    private final Set<String> corsOrigins;

    public BodySizeFilter(long maxBytes, long largeMaxBytes, Set<String> corsOrigins) {
        this.maxBytes = Math.max(1024, maxBytes);
        this.largeMaxBytes = Math.max(this.maxBytes, largeMaxBytes);
        this.corsOrigins = corsOrigins == null ? Set.of() : Set.copyOf(corsOrigins);
    }

    /** 큰 본문이 필요한 경로: 관리자 화면 전체, 사이트 설정(PUT /api/site), 기록 가져오기 */
    static boolean large(String method, String path) {
        return path.startsWith("/api/admin/") || ("PUT".equalsIgnoreCase(method) && path.equals("/api/site")) || path.startsWith("/api/records/");
    }

    long limitFor(HttpServletRequest req) {
        return large(req.getMethod(), ApiRequests.path(req)) ? largeMaxBytes : maxBytes;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        return !ApiRequests.path(req).startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        long limit = limitFor(req);
        long declared = req.getContentLengthLong();
        if (declared > limit) {
            res.setHeader("Connection", "close");
            ApiRequests.writeError(req, res, 413, MESSAGE, corsOrigins);
            return;
        }
        chain.doFilter(declared >= 0 || !RateLimitFilter.isWrite(req.getMethod()) ? req : new Limited(req, limit), res);
    }

    /** 길이를 모르는 본문을 읽으면서 센다 */
    static final class Limited extends HttpServletRequestWrapper {
        private final long limit;
        private ServletInputStream stream;
        private BufferedReader reader;

        Limited(HttpServletRequest req, long limit) {
            super(req);
            this.limit = limit;
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            if (stream == null) {
                ServletInputStream in = super.getInputStream();
                stream = new ServletInputStream() {
                    private long count;

                    private void add(long n) throws TooLarge {
                        if (n > 0 && (count += n) > limit) throw new TooLarge();
                    }

                    @Override public int read() throws IOException {
                        int b = in.read();
                        if (b >= 0) add(1);
                        return b;
                    }

                    @Override public int read(byte[] buf, int off, int len) throws IOException {
                        int n = in.read(buf, off, len);
                        add(n);
                        return n;
                    }

                    @Override public boolean isFinished() { return in.isFinished(); }
                    @Override public boolean isReady() { return in.isReady(); }
                    @Override public void setReadListener(ReadListener l) { in.setReadListener(l); }
                };
            }
            return stream;
        }

        @Override
        public BufferedReader getReader() throws IOException {
            if (reader == null) {
                String enc = getCharacterEncoding();
                Charset cs = enc == null ? StandardCharsets.UTF_8 : Charset.forName(enc);
                reader = new BufferedReader(new InputStreamReader(getInputStream(), cs));
            }
            return reader;
        }
    }
}
