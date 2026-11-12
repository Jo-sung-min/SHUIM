package kr.co.shuim.pet;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.shuim.auth.AuthService;
import kr.co.shuim.config.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/pet")
public class PetController {
    private final AuthService auth;
    private final PetService pets;
    public PetController(AuthService auth, PetService pets) { this.auth = auth; this.pets = pets; }
    private String user(HttpServletRequest req) {
        return auth.currentUser(req).filter(u -> !u.anonymous() && !u.blocked()).orElseThrow(() -> ApiException.unauthorized("로그인하면 나만의 모루와 함께할 수 있어요.")).id();
    }
    private ResponseEntity<PetService.View> result(PetService.View view) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(view); }
    @GetMapping public ResponseEntity<PetService.View> get(HttpServletRequest req) { return result(pets.get(user(req))); }
    @PostMapping("/feed") public ResponseEntity<PetService.View> feed(@RequestBody PetService.FeedInput in, HttpServletRequest req) { return result(pets.feed(user(req), in)); }
    @PostMapping("/snack") public ResponseEntity<PetService.View> snack(HttpServletRequest req) { return result(pets.snack(user(req))); }
    @PostMapping("/care") public ResponseEntity<PetService.View> care(@RequestBody PetService.CareInput in, HttpServletRequest req) { return result(pets.care(user(req), in)); }
    public record NameInput(String name) {}
    @PutMapping("/name") public ResponseEntity<PetService.View> name(@RequestBody NameInput in, HttpServletRequest req) { return result(pets.rename(user(req), in.name())); }
    @PutMapping("/journal") public ResponseEntity<PetService.View> journal(@RequestBody PetService.JournalInput in, HttpServletRequest req) { return result(pets.journal(user(req), in)); }
    @PutMapping("/home") public ResponseEntity<PetService.View> home(@RequestBody PetService.HomeInput in, HttpServletRequest req) { return result(pets.home(user(req), in)); }
    @PutMapping("/decor") public ResponseEntity<PetService.View> decor(@RequestBody PetService.DecorInput in, HttpServletRequest req) { return result(pets.decorate(user(req), in)); }
    @PutMapping("/appearance") public ResponseEntity<PetService.View> appearance(@RequestBody PetService.AppearanceInput in, HttpServletRequest req) { return result(pets.appearance(user(req), in)); }
}
