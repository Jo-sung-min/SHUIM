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
    /** 있었지만 지금은 없는 것 (만료된 바닷가 티켓 등): 프론트는 다시 시작하면 된다 */
    public static ApiException gone(String m) { return new ApiException(410, m); }
    public static ApiException unavailable(String m) { return new ApiException(503, m); }
}
