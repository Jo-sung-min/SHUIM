package kr.co.shuim.config;

/** 상태 코드와 사용자에게 보여줄 메시지를 가진 예외. 핸들러가 {"error": message} 로 바꾼다 */
public class ApiException extends RuntimeException {
    private final int status;

    public ApiException(int status, String message) {
        super(message);
        this.status = status;
    }

    public int status() { return status; }

    public static ApiException badRequest(String m) { return new ApiException(400, m); }
    public static ApiException unauthorized(String m) { return new ApiException(401, m); }
    public static ApiException forbidden(String m) { return new ApiException(403, m); }
    public static ApiException notFound(String m) { return new ApiException(404, m); }
    public static ApiException unavailable(String m) { return new ApiException(503, m); }
}
