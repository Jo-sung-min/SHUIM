package kr.co.shuim.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.ServletRequestBindingException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.Map;

/**
 * 프론트는 실패 응답의 {"error": "..."} 를 그대로 사용자에게 보여준다.
 * 클라이언트 입력 오류는 4xx 로 짧게 답하고 스택 없이 WARN/DEBUG 로만 남긴다. 예상 못 한 오류만 ERROR + 스택.
 */
@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);
    static final String BAD_VALUE = "요청 값이 올바르지 않아요.";

    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, String>> api(ApiException e) {
        return ResponseEntity.status(e.status()).body(Map.of("error", e.getMessage()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Map<String, String>> unreadable(HttpMessageNotReadableException e) {
        // 본문 크기 상한(BodySizeFilter)은 읽는 도중 끊기므로 여기로 감싸져 온다
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof BodySizeFilter.TooLarge) return tooLarge((BodySizeFilter.TooLarge) t);
        }
        log.debug("읽을 수 없는 요청 본문: {}", e.getClass().getSimpleName());
        return ResponseEntity.badRequest().body(Map.of("error", "요청 형식이 올바르지 않아요"));
    }

    @ExceptionHandler(BodySizeFilter.TooLarge.class)
    ResponseEntity<Map<String, String>> tooLarge(BodySizeFilter.TooLarge e) {
        log.warn("요청 본문이 상한을 넘었어요");
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(Map.of("error", BodySizeFilter.MESSAGE));
    }

    /** 경로·쿼리 값의 타입이 틀렸거나, 필요한 파라미터·헤더·쿠키가 없을 때 */
    @ExceptionHandler({MethodArgumentTypeMismatchException.class, ServletRequestBindingException.class})
    ResponseEntity<Map<String, String>> badValue(Exception e) {
        log.warn("잘못된 요청 값: {}", e.getClass().getSimpleName());
        return ResponseEntity.badRequest().body(Map.of("error", BAD_VALUE));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<Map<String, String>> unsupportedMedia(HttpMediaTypeNotSupportedException e) {
        log.debug("지원하지 않는 Content-Type: {}", e.getContentType());
        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE).body(Map.of("error", "요청 형식이 올바르지 않아요"));
    }

    @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
    ResponseEntity<Void> notAcceptable(HttpMediaTypeNotAcceptableException e) {
        // 받을 수 있는 형식이 없으니 본문 없이 답한다
        return ResponseEntity.status(HttpStatus.NOT_ACCEPTABLE).build();
    }

    /** 없는 경로·맞지 않는 메서드는 지금처럼 404 (프런트가 기대하는 동작 유지) */
    @ExceptionHandler({NoResourceFoundException.class, HttpRequestMethodNotSupportedException.class})
    ResponseEntity<Map<String, String>> notFound(Exception e) {
        log.debug("없는 경로: {}", e.getClass().getSimpleName());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> other(Exception e) {
        log.error("unhandled", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", "처리하지 못했어요. 잠시 후 다시 시도해요."));
    }
}
