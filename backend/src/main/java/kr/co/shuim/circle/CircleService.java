package kr.co.shuim.circle;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.ai.ClaudeClient;
import kr.co.shuim.ai.Crisis;
import kr.co.shuim.ai.JsonText;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.common.Db;
import kr.co.shuim.common.Ids;
import kr.co.shuim.community.CommunityLogic;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.profile.BadgeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;

/**
 * 커뮤니티 소로우: 회사원·자영업·취준생·쉬는 중처럼 처지별로 모여 힘든 점을 털어놓는 곳.
 * 소로우는 서비스(관리자)가 열고, 누구나 가입·리스닝하고 사연을 보내면 소로우지기가 검토해 '#번호'로 게시한다.
 * 게시된 사연은 shout_posts(community_id, post_no)로 들어가 외침과 같은 힘내요·댓글·신고·배지를 쓴다.
 * 보낸 사람(author_id)은 소로우지기 화면과 다른 사람의 화면 어디에도 내려가지 않는다.
 */
@Service
public class CircleService {
    private static final Logger log = LoggerFactory.getLogger(CircleService.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcClient jdbc;
    private final MailService mail;
    private final ClaudeClient claude;
    private final ObjectMapper json;
    private final BadgeService badges;

    public CircleService(JdbcClient jdbc, MailService mail, ClaudeClient claude, ObjectMapper json, BadgeService badges) {
        this.jdbc = jdbc;
        this.mail = mail;
        this.claude = claude;
        this.json = json;
        this.badges = badges;
    }

    /* ---------- 모양 ---------- */

    public record Circle(String id, String slug, String name, String kind, String domain, boolean verified, String joinMode, String visibility,
                         String intro, String notice, String createdBy, int postSeq, long createdAt, int memberCount, int listenerCount, boolean sample) {}

    public record Member(String role, String status, boolean primary, boolean verified) {
        public boolean active() { return "active".equals(status); }
        public boolean keeper() { return active() && ("owner".equals(role) || "keeper".equals(role)); }
        public boolean owner() { return active() && "owner".equals(role); }
    }

    /** 화면용 소로우 요약 */
    public Map<String, Object> view(Circle c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.id());
        m.put("slug", c.slug());
        m.put("name", c.name());
        m.put("kind", c.kind());
        if (c.domain() != null) m.put("domain", c.domain());
        m.put("verified", c.verified());
        m.put("joinMode", c.joinMode());
        m.put("visibility", c.visibility());
        m.put("intro", c.intro());
        m.put("notice", c.notice());
        m.put("memberCount", c.memberCount());
        m.put("listenerCount", c.listenerCount());
        m.put("postCount", c.postSeq());
        if (c.sample()) m.put("sample", true);
        m.put("createdAt", c.createdAt());
        return m;
    }

    private static final String CIRCLE_SELECT = """
        SELECT c.*,
               (SELECT count(*) FROM community_members m WHERE m.community_id = c.id AND m.status = 'active')::int AS member_count,
               (SELECT count(*) FROM community_follows f WHERE f.community_id = c.id)::int AS listener_count
          FROM communities c""";

    private static Circle circleRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Circle(rs.getString("id"), rs.getString("slug"), rs.getString("name"), rs.getString("kind"), rs.getString("domain"), rs.getBoolean("verified"),
            rs.getString("join_mode"), rs.getString("visibility"), rs.getString("intro"), rs.getString("notice"), rs.getString("created_by"), rs.getInt("post_seq"),
            Db.msReq(rs, "created_at"), rs.getInt("member_count"), rs.getInt("listener_count"), rs.getBoolean("sample"));
    }

    public Circle bySlug(String slug) {
        return jdbc.sql(CIRCLE_SELECT + " WHERE c.slug = ?").param(slug == null ? "" : slug.toLowerCase(Locale.ROOT))
            .query((rs, i) -> circleRow(rs)).optional().orElseThrow(() -> ApiException.notFound("소로우를 찾을 수 없어요"));
    }

    public Optional<Member> member(String circleId, String userId) {
        if (userId == null) return Optional.empty();
        return jdbc.sql("SELECT role, status, is_primary, verified_at FROM community_members WHERE community_id = ? AND user_id = ?").param(circleId).param(userId)
            .query((rs, i) -> new Member(rs.getString("role"), rs.getString("status"), rs.getBoolean("is_primary"), rs.getObject("verified_at") != null)).optional();
    }

    private static boolean appAdmin(DbUser u) { return u != null && "admin".equals(u.role()) && !u.anonymous() && !u.blocked(); }

    private Member requireKeeper(Circle c, DbUser me) {
        Member m = member(c.id(), me.id()).orElse(null);
        if (m != null && m.keeper()) return m;
        if (appAdmin(me)) return new Member("keeper", "active", false, true);
        throw ApiException.forbidden("소로우지기만 할 수 있어요");
    }

    private Member requireActiveMember(Circle c, DbUser me) {
        Member m = member(c.id(), me.id()).orElseThrow(() -> ApiException.forbidden("이 소로우의 멤버만 할 수 있어요"));
        if (!m.active()) throw ApiException.forbidden("멤버 승인을 기다리는 중이에요");
        return m;
    }

    private static void assertNotBlocked(DbUser me) {
        if (me.blocked()) throw ApiException.forbidden("이 계정은 차단되어 글을 쓸 수 없어요");
    }

    /* ---------- 읽기 ---------- */

    /** 둘러보기: 모든 처지 소로우를 연 순서대로 (멤버 수로 줄 세우지 않는다). 처지 묶음·이름 검색 */
    public List<Map<String, Object>> browse(String kind, String q) {
        String k = kind != null && CircleLogic.KINDS.contains(kind) ? kind : null;
        String query = q == null ? "" : q.strip();
        return jdbc.sql(CIRCLE_SELECT + " WHERE (CAST(:kind AS VARCHAR) IS NULL OR c.kind = :kind) AND (:q = '' OR c.name ILIKE '%' || :q || '%') ORDER BY c.created_at, c.slug LIMIT 60")
            .param("kind", k).param("q", query)
            .query((rs, i) -> circleRow(rs)).list().stream()
            .map(this::view).toList();
    }

    /** 내가 속한 소로우 (대표 먼저) + 리스닝 중인 소로우 */
    public Map<String, Object> mine(DbUser me) {
        List<Map<String, Object>> member = new ArrayList<>();
        jdbc.sql(CIRCLE_SELECT.replace("SELECT c.*,", "SELECT c.*, mm.role, mm.status, mm.is_primary,") + " JOIN community_members mm ON mm.community_id = c.id WHERE mm.user_id = ? ORDER BY mm.is_primary DESC, mm.joined_at")
            .param(me.id()).query((rs, i) -> {
                Map<String, Object> v = view(circleRow(rs));
                v.put("role", rs.getString("role"));
                v.put("status", rs.getString("status"));
                v.put("primary", rs.getBoolean("is_primary"));
                return v;
            }).list().forEach(member::add);
        List<Map<String, Object>> listening = jdbc.sql(CIRCLE_SELECT + " JOIN community_follows ff ON ff.community_id = c.id WHERE ff.user_id = ? ORDER BY ff.created_at DESC")
            .param(me.id()).query((rs, i) -> view(circleRow(rs))).list();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("member", member);
        out.put("listening", listening);
        return out;
    }

    /** 이번 주 가장 따뜻한 소로우: 지난 7일 동안 멤버들이 다른 소로우·광장 글에 남긴 위로 댓글이 많은 순 (횟수는 내려보내지 않는다) */
    public List<Map<String, Object>> warmest() {
        List<String> ids = jdbc.sql("""
            SELECT m.community_id, count(*) AS n
              FROM comments c
              JOIN community_members m ON m.user_id = c.author_id AND m.status = 'active'
              JOIN shout_posts sp ON c.post_kind = 'post' AND sp.id = c.post_id
             WHERE c.created_at > now() - INTERVAL '7 days' AND c.hidden = FALSE AND sp.hidden = FALSE
               AND (sp.community_id IS NULL OR sp.community_id <> m.community_id)
             GROUP BY m.community_id ORDER BY n DESC LIMIT 40""").query((rs, i) -> rs.getString("community_id")).list();
        if (ids.isEmpty()) return List.of();
        Map<String, Circle> byId = new HashMap<>();
        jdbc.sql(CIRCLE_SELECT + " WHERE c.id IN (:ids)").param("ids", ids).query((rs, i) -> circleRow(rs)).list().forEach(c -> byId.put(c.id(), c));
        List<Map<String, Object>> out = new ArrayList<>();
        for (String id : ids) {
            Circle c = byId.get(id);
            if (c == null) continue;
            Map<String, Object> v = view(c);
            v.put("rank", out.size() + 1);
            out.add(v);
            if (out.size() >= 10) break;
        }
        return out;
    }

    /** 소로우 하나 + 보는 사람과의 관계 */
    public Map<String, Object> detail(DbUser viewer, String slug) {
        Circle c = bySlug(slug);
        Map<String, Object> out = view(c);
        Optional<Member> m = viewer == null ? Optional.empty() : member(c.id(), viewer.id());
        Map<String, Object> me = new LinkedHashMap<>();
        me.put("role", m.map(Member::role).orElse(null));
        me.put("status", m.map(Member::status).orElse(null));
        me.put("primary", m.map(Member::primary).orElse(false));
        me.put("verified", m.map(Member::verified).orElse(false));
        me.put("keeper", m.map(Member::keeper).orElse(false) || appAdmin(viewer));
        me.put("listening", viewer != null && jdbc.sql("SELECT count(*) FROM community_follows WHERE user_id = ? AND community_id = ?")
            .param(viewer.id()).param(c.id()).query(Long.class).single() > 0);
        me.put("canRead", !"members".equals(c.visibility()) || m.map(Member::active).orElse(false) || appAdmin(viewer));
        out.put("me", me);
        if (m.map(Member::keeper).orElse(false) || appAdmin(viewer)) {
            jdbc.sql("SELECT invite_code FROM communities WHERE id = ?").param(c.id()).query(String.class).optional().ifPresent(code -> out.put("inviteCode", code));
            out.put("pendingCount", jdbc.sql("SELECT count(*) FROM submissions WHERE community_id = ? AND status = 'pending'").param(c.id()).query(Long.class).single());
            out.put("waitingMembers", jdbc.sql("SELECT count(*) FROM community_members WHERE community_id = ? AND status = 'pending'").param(c.id()).query(Long.class).single());
        }
        return out;
    }

    /* ---------- 만들기·설정 ---------- */

    public record CreateInput(String name, String slug, String kind, String intro, String joinMode, String visibility, String domain) {}

    @Transactional
    public Map<String, Object> create(DbUser me, CreateInput in) {
        // 처지 소로우는 서비스가 연다 (회사·학교 이름을 단 소로우가 생기지 않게)
        if (!appAdmin(me)) throw ApiException.forbidden("소로우는 소로우 운영진이 열어요. 필요한 처지가 있으면 알려 주세요");
        String name = CircleLogic.normalizeName(in.name());
        if (name == null) throw ApiException.badRequest("이름은 2~26자로 해요 (끝에 '소로우'가 붙어요)");
        String slug = CircleLogic.normalizeSlug(in.slug());
        if (slug == null) throw ApiException.badRequest("주소는 영문 소문자·숫자·하이픈 3~40자로 해요 (예: korea-univ)");
        String kind = in.kind() != null && CircleLogic.KINDS.contains(in.kind()) ? in.kind() : null;
        if (kind == null) throw ApiException.badRequest("종류를 골라 주세요");
        long owned = jdbc.sql("SELECT count(*) FROM communities WHERE created_by = ?").param(me.id()).query(Long.class).single();
        if (owned >= CircleLogic.MAX_OWNED) throw ApiException.badRequest("소로우는 한 사람이 " + CircleLogic.MAX_OWNED + "개까지 열 수 있어요");
        String key = CircleLogic.nameKey(name);
        if (jdbc.sql("SELECT count(*) FROM communities WHERE name_key = ?").param(key).query(Long.class).single() > 0) throw ApiException.badRequest("같은 이름의 소로우가 이미 있어요");
        if (jdbc.sql("SELECT count(*) FROM communities WHERE slug = ?").param(slug).query(Long.class).single() > 0) throw ApiException.badRequest("이미 쓰고 있는 주소예요");
        String domain = null; // 소속 메일 인증은 쓰지 않는다
        String joinMode = in.joinMode() != null && CircleLogic.JOIN_MODES.contains(in.joinMode()) && !"domain".equals(in.joinMode()) ? in.joinMode() : "open";
        String visibility = in.visibility() != null && CircleLogic.VISIBILITIES.contains(in.visibility()) ? in.visibility() : "public";
        String intro = in.intro() == null ? "" : in.intro().strip();
        if (intro.length() > 200) intro = intro.substring(0, 200);
        String id = Ids.uid();
        jdbc.sql("""
            INSERT INTO communities (id, slug, name, name_key, kind, domain, join_mode, visibility, intro, invite_code, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""")
            .param(id).param(slug).param(name).param(key).param(kind).param(domain).param(joinMode).param(visibility).param(intro)
            .param("invite".equals(joinMode) ? inviteCode() : null).param(me.id()).update();
        boolean hasPrimary = jdbc.sql("SELECT count(*) FROM community_members WHERE user_id = ? AND is_primary").param(me.id()).query(Long.class).single() > 0;
        jdbc.sql("INSERT INTO community_members (community_id, user_id, role, status, is_primary) VALUES (?, ?, 'owner', 'active', ?)")
            .param(id).param(me.id()).param(!hasPrimary).update();
        badges.refresh(me.id());
        return detail(me, slug);
    }

    private static String inviteCode() {
        String abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 8; i++) sb.append(abc.charAt(RANDOM.nextInt(abc.length())));
        return sb.toString();
    }

    /** 설정: 소로우지기는 공지만, 연 사람은 소개·가입 방식·공개 범위·초대 코드까지 */
    @Transactional
    public Map<String, Object> update(DbUser me, String slug, Map<String, Object> b) {
        Circle c = bySlug(slug);
        Member m = requireKeeper(c, me);
        if (b.get("notice") instanceof String n) {
            String t = n.strip();
            jdbc.sql("UPDATE communities SET notice = ? WHERE id = ?").param(t.length() > 200 ? t.substring(0, 200) : t).param(c.id()).update();
        }
        boolean owner = m.owner() || appAdmin(me);
        if (owner) {
            if (b.get("intro") instanceof String n) {
                String t = n.strip();
                jdbc.sql("UPDATE communities SET intro = ? WHERE id = ?").param(t.length() > 200 ? t.substring(0, 200) : t).param(c.id()).update();
            }
            if (b.get("visibility") instanceof String v && CircleLogic.VISIBILITIES.contains(v)) {
                jdbc.sql("UPDATE communities SET visibility = ? WHERE id = ?").param(v).param(c.id()).update();
            }
            if (b.get("joinMode") instanceof String j && CircleLogic.JOIN_MODES.contains(j) && !"domain".equals(j)) {
                jdbc.sql("UPDATE communities SET join_mode = ?, invite_code = CASE WHEN ? = 'invite' THEN COALESCE(invite_code, ?) ELSE invite_code END WHERE id = ?")
                    .param(j).param(j).param(inviteCode()).param(c.id()).update();
            }
            if (Boolean.TRUE.equals(b.get("regenerateInvite"))) {
                jdbc.sql("UPDATE communities SET invite_code = ? WHERE id = ?").param(inviteCode()).param(c.id()).update();
            }
        } else if (b.containsKey("intro") || b.containsKey("visibility") || b.containsKey("joinMode") || b.containsKey("regenerateInvite")) {
            throw ApiException.forbidden("소로우를 연 사람만 바꿀 수 있어요");
        }
        return detail(me, slug);
    }

    /* ---------- 가입·나가기·대표·리스닝 ---------- */

    @Transactional
    public Map<String, Object> join(DbUser me, String slug, String code) {
        assertNotBlocked(me);
        Circle c = bySlug(slug);
        Optional<Member> cur = member(c.id(), me.id());
        if (cur.isPresent()) return detail(me, slug);
        String status = switch (c.joinMode()) {
            case "open" -> "active";
            case "approve" -> "pending";
            case "invite" -> {
                String want = jdbc.sql("SELECT invite_code FROM communities WHERE id = ?").param(c.id()).query(String.class).optional().orElse(null);
                if (want == null || code == null || !want.equalsIgnoreCase(code.strip())) throw ApiException.badRequest("초대 코드가 맞지 않아요");
                yield "active";
            }
            default -> throw ApiException.badRequest("학교·회사 메일로 인증하면 멤버가 돼요");
        };
        insertMember(c.id(), me.id(), status, false);
        return detail(me, slug);
    }

    private void insertMember(String circleId, String userId, String status, boolean verified) {
        boolean hasPrimary = jdbc.sql("SELECT count(*) FROM community_members WHERE user_id = ? AND is_primary").param(userId).query(Long.class).single() > 0;
        jdbc.sql("""
            INSERT INTO community_members (community_id, user_id, role, status, is_primary, verified_at) VALUES (?, ?, 'member', ?, ?, ?)
            ON CONFLICT (community_id, user_id) DO UPDATE SET status = EXCLUDED.status, verified_at = COALESCE(EXCLUDED.verified_at, community_members.verified_at)""")
            .param(circleId).param(userId).param(status).param(!hasPrimary && "active".equals(status)).param(verified ? LocalDateTime.now(ZoneOffset.UTC) : null).update();
    }

    @Transactional
    public Map<String, Object> leave(DbUser me, String slug) {
        Circle c = bySlug(slug);
        Member m = member(c.id(), me.id()).orElseThrow(() -> ApiException.badRequest("멤버가 아니에요"));
        if ("owner".equals(m.role())) throw ApiException.badRequest("소로우를 연 사람은 나갈 수 없어요");
        jdbc.sql("DELETE FROM community_members WHERE community_id = ? AND user_id = ?").param(c.id()).param(me.id()).update();
        return detail(me, slug);
    }

    @Transactional
    public Map<String, Object> setPrimary(DbUser me, String slug) {
        Circle c = bySlug(slug);
        requireActiveMember(c, me);
        jdbc.sql("UPDATE community_members SET is_primary = FALSE WHERE user_id = ? AND is_primary").param(me.id()).update();
        jdbc.sql("UPDATE community_members SET is_primary = TRUE WHERE user_id = ? AND community_id = ?").param(me.id()).param(c.id()).update();
        return detail(me, slug);
    }

    @Transactional
    public Map<String, Object> toggleFollow(DbUser me, String slug) {
        Circle c = bySlug(slug);
        int del = jdbc.sql("DELETE FROM community_follows WHERE user_id = ? AND community_id = ?").param(me.id()).param(c.id()).update();
        if (del == 0) jdbc.sql("INSERT INTO community_follows (user_id, community_id) VALUES (?, ?)").param(me.id()).param(c.id()).update();
        return detail(me, slug);
    }

    /* ---------- 소속 인증 (학교·회사 메일) ---------- */

    @Transactional
    public Map<String, Object> verifyStart(DbUser me, String slug, String email) {
        assertNotBlocked(me);
        Circle c = bySlug(slug);
        if (c.domain() == null) throw ApiException.badRequest("이 소로우는 메일 인증을 쓰지 않아요");
        if (!CircleLogic.emailMatchesDomain(email, c.domain())) throw ApiException.badRequest("@" + c.domain() + " 메일만 인증할 수 있어요");
        String hash = CircleLogic.emailHash(email);
        if (jdbc.sql("SELECT count(*) FROM community_verifications WHERE community_id = ? AND email_hash = ?").param(c.id()).param(hash).query(Long.class).single() > 0) {
            throw ApiException.badRequest("이미 이 메일로 인증한 멤버가 있어요");
        }
        long recent = jdbc.sql("SELECT count(*) FROM community_email_codes WHERE user_id = ? AND created_at > now() - INTERVAL '1 hour'").param(me.id()).query(Long.class).single();
        if (recent >= 5) throw ApiException.badRequest("인증 메일은 한 시간에 5번까지 보낼 수 있어요");
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        String id = Ids.uid();
        jdbc.sql("INSERT INTO community_email_codes (id, community_id, user_id, email_hash, code_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
            .param(id).param(c.id()).param(me.id()).param(hash).param(CircleLogic.sha256(id + ":" + code))
            .param(LocalDateTime.now(ZoneOffset.UTC).plusMinutes(10)).update();
        Map<String, Object> out = new LinkedHashMap<>();
        if (mail.configured()) {
            try {
                mail.sendCode(email.strip(), c.name(), code);
            } catch (Exception e) {
                log.warn("circle mail failed: {}", e.getMessage());
                throw ApiException.unavailable("인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요");
            }
            out.put("sent", true);
        } else if (mail.devFallback()) {
            out.put("sent", false);
            out.put("devCode", code); // 개발 환경 전용: 메일 설정 전이라 화면에 코드를 보여 준다
        } else {
            throw ApiException.unavailable("아직 인증 메일을 보낼 수 없어요. 운영자에게 알려 주세요");
        }
        return out;
    }

    @Transactional
    public Map<String, Object> verifyConfirm(DbUser me, String slug, String code) {
        Circle c = bySlug(slug);
        record Pending(String id, String emailHash, String codeHash, int attempts) {}
        Pending p = jdbc.sql("""
            SELECT id, email_hash, code_hash, attempts FROM community_email_codes
             WHERE user_id = ? AND community_id = ? AND used_at IS NULL AND expires_at > now()
             ORDER BY created_at DESC LIMIT 1""").param(me.id()).param(c.id())
            .query((rs, i) -> new Pending(rs.getString("id"), rs.getString("email_hash"), rs.getString("code_hash"), rs.getInt("attempts"))).optional()
            .orElseThrow(() -> ApiException.badRequest("인증 코드가 없거나 시간이 지났어요. 다시 보내 주세요"));
        if (p.attempts() >= 5) throw ApiException.badRequest("여러 번 틀렸어요. 코드를 다시 보내 주세요");
        String given = code == null ? "" : code.replaceAll("\\D", "");
        if (!CircleLogic.sha256(p.id() + ":" + given).equals(p.codeHash())) {
            jdbc.sql("UPDATE community_email_codes SET attempts = attempts + 1 WHERE id = ?").param(p.id()).update();
            throw ApiException.badRequest("인증 코드가 맞지 않아요");
        }
        jdbc.sql("UPDATE community_email_codes SET used_at = now() WHERE id = ?").param(p.id()).update();
        int added = jdbc.sql("INSERT INTO community_verifications (community_id, email_hash) VALUES (?, ?) ON CONFLICT DO NOTHING").param(c.id()).param(p.emailHash()).update();
        if (added == 0) throw ApiException.badRequest("이미 이 메일로 인증한 멤버가 있어요");
        Optional<Member> cur = member(c.id(), me.id());
        if (cur.isPresent()) {
            jdbc.sql("UPDATE community_members SET status = 'active', verified_at = now() WHERE community_id = ? AND user_id = ?").param(c.id()).param(me.id()).update();
            if ("owner".equals(cur.get().role()) && !c.verified()) jdbc.sql("UPDATE communities SET verified = TRUE WHERE id = ?").param(c.id()).update();
        } else {
            insertMember(c.id(), me.id(), "active", true);
        }
        return detail(me, slug);
    }

    /* ---------- 멤버 관리 (소로우지기) ---------- */

    public List<Map<String, Object>> members(DbUser me, String slug) {
        Circle c = bySlug(slug);
        requireKeeper(c, me);
        return jdbc.sql("""
            SELECT m.user_id, u.nick, m.role, m.status, m.verified_at, m.joined_at FROM community_members m JOIN users u ON u.id = m.user_id
             WHERE m.community_id = ? ORDER BY (m.status = 'pending') DESC, (m.role = 'owner') DESC, (m.role = 'keeper') DESC, m.joined_at LIMIT 500""")
            .param(c.id()).query((rs, i) -> {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("userId", rs.getString("user_id"));
                r.put("nick", rs.getString("nick"));
                r.put("role", rs.getString("role"));
                r.put("status", rs.getString("status"));
                r.put("verified", rs.getObject("verified_at") != null);
                r.put("joinedAt", Db.msReq(rs, "joined_at"));
                return r;
            }).list();
    }

    @Transactional
    public List<Map<String, Object>> memberAction(DbUser me, String slug, String userId, String action) {
        Circle c = bySlug(slug);
        Member actor = requireKeeper(c, me);
        Member target = member(c.id(), userId).orElseThrow(() -> ApiException.notFound("멤버를 찾을 수 없어요"));
        boolean owner = actor.owner() || appAdmin(me);
        switch (action == null ? "" : action) {
            case "approve" -> jdbc.sql("UPDATE community_members SET status = 'active' WHERE community_id = ? AND user_id = ?").param(c.id()).param(userId).update();
            case "remove" -> {
                if ("owner".equals(target.role())) throw ApiException.badRequest("소로우를 연 사람은 내보낼 수 없어요");
                if ("keeper".equals(target.role()) && !owner) throw ApiException.forbidden("소로우지기는 연 사람만 내보낼 수 있어요");
                jdbc.sql("DELETE FROM community_members WHERE community_id = ? AND user_id = ?").param(c.id()).param(userId).update();
            }
            case "keeper", "unkeeper" -> {
                if (!owner) throw ApiException.forbidden("소로우지기 임명은 연 사람만 할 수 있어요");
                if ("owner".equals(target.role())) throw ApiException.badRequest("연 사람의 역할은 바꿀 수 없어요");
                if (!target.active()) throw ApiException.badRequest("승인된 멤버만 소로우지기가 될 수 있어요");
                jdbc.sql("UPDATE community_members SET role = ? WHERE community_id = ? AND user_id = ?").param("keeper".equals(action) ? "keeper" : "member").param(c.id()).param(userId).update();
                badges.refresh(userId);
            }
            default -> throw ApiException.badRequest("알 수 없는 동작이에요");
        }
        return members(me, slug);
    }

    /* ---------- 사연 ---------- */

    public record Draft(String text, List<String> masked, String source) {}

    private static final String DRAFT_PROMPT = """
        너는 커뮤니티 소로우(회사원·자영업·취준생·쉬는 중처럼 처지별로 모인 익명 사연 공간)의 사연 정리 도우미야.
        사용자가 보낸 사연을 게시하기 좋게 다듬되, 쓴 사람의 말투와 1인칭 시점과 내용은 그대로 둬.
        - 띄어쓰기·맞춤법·문단만 정리해. 없는 사실을 더하거나 감정을 과장하지 마.
        - 사람을 특정할 수 있는 정보는 ○○ 로 가려: 실명, 학번·사번, 전화번호, 메일, 특정 수업·팀·부서 이름, 날짜와 장소가 합쳐져 한 사람을 가리키는 표현.
        - 회사·학교·기관·가게 이름도 ○○ 로 가려. 여기서는 소속 대신 처지로만 이야기해 (소속 이름이 다른 사람에게 박탈감이 되지 않게).
        - 특정인을 비난·저격하는 문장은 그 사람이 드러나지 않게 가리기만 하고, 판단은 하지 마.
        - 1200자를 넘지 마.
        출력은 아래 JSON 하나만. 코드블록이나 다른 텍스트 없이.
        { "text": "정리한 사연", "masked": ["가린 정보의 종류 (예: 실명, 학번)"] }""";

    /** AI 정리 + 가림 제안. AI 가 없거나 실패하면 규칙 기반(공백 정리 + 실명·연락처 가리기) */
    public Draft tidy(String text) {
        String raw = text == null ? "" : text;
        CircleLogic.Masked rule = CircleLogic.mask(CircleLogic.tidy(raw));
        if (!claude.configured()) return new Draft(rule.text(), rule.found(), "local");
        try {
            String out = claude.complete(claude.resolveModel(null), 4000, DRAFT_PROMPT, "사연:\n" + raw);
            String j = JsonText.extract(out);
            JsonNode node = j == null ? null : json.readTree(j);
            String t = node == null ? "" : node.path("text").asText("");
            if (t.isBlank()) return new Draft(rule.text(), rule.found(), "local");
            List<String> masked = new ArrayList<>();
            if (node.path("masked").isArray()) node.get("masked").forEach(n -> masked.add(n.asText()));
            // AI 가 놓친 연락처·번호는 규칙으로 한 번 더
            CircleLogic.Masked again = CircleLogic.mask(t);
            for (String f : again.found()) if (!masked.contains(f)) masked.add(f);
            String finalText = again.text().length() > 1200 ? again.text().substring(0, 1200) : again.text();
            return new Draft(finalText, masked, "ai");
        } catch (Exception e) {
            log.warn("circle tidy failed: {}", e.getMessage());
            return new Draft(rule.text(), rule.found(), "local");
        }
    }

    /** 보내기 전 미리보기 (멤버) */
    public Draft preview(DbUser me, String slug, String text) {
        Circle c = bySlug(slug);
        requireActiveMember(c, me);
        return tidy(text);
    }

    @Transactional
    public Map<String, Object> submit(DbUser me, String slug, String cat, String text) {
        assertNotBlocked(me);
        Circle c = bySlug(slug);
        requireActiveMember(c, me);
        if (cat == null || !CommunityLogic.SHOUT_CAT_IDS.contains(cat)) throw ApiException.badRequest("카테고리가 올바르지 않아요");
        String t = text == null ? "" : text.strip();
        if (t.length() < 5) throw ApiException.badRequest("사연을 조금 더 적어 주세요");
        if (t.length() > 1200) t = t.substring(0, 1200);
        long waiting = jdbc.sql("SELECT count(*) FROM submissions WHERE author_id = ? AND community_id = ? AND status = 'pending'").param(me.id()).param(c.id()).query(Long.class).single();
        if (waiting >= 5) throw ApiException.badRequest("검토를 기다리는 사연이 5개예요. 조금만 기다려 주세요");
        boolean crisis = Crisis.hasSignal(t);
        String id = Ids.uid();
        jdbc.sql("INSERT INTO submissions (id, community_id, author_id, cat, text, crisis) VALUES (?, ?, ?, ?, ?, ?)")
            .param(id).param(c.id()).param(me.id()).param(cat).param(t).param(crisis).update();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("crisis", crisis);
        return out;
    }

    /** 소로우지기 검토 큐. 보낸 사람은 내려가지 않는다. 위기 신호 먼저 */
    public List<Map<String, Object>> queue(DbUser me, String slug, String status) {
        Circle c = bySlug(slug);
        requireKeeper(c, me);
        String st = "held".equals(status) ? "held" : "done".equals(status) ? "done" : "pending";
        String where = "done".equals(st) ? "s.status IN ('published', 'rejected')" : "s.status = '" + st + "'";
        return jdbc.sql("""
            SELECT s.id, s.cat, s.text, s.status, s.crisis, s.ai_draft, s.reason, s.reply, s.created_at, s.decided_at, p.post_no, p.id AS post_id, p.created_at AS publish_at
              FROM submissions s LEFT JOIN shout_posts p ON p.id = s.post_id
             WHERE s.community_id = ? AND\s""" + where + "\n" + """
             ORDER BY s.crisis DESC, CASE WHEN s.status IN ('published', 'rejected') THEN s.decided_at END DESC NULLS LAST, s.created_at
             LIMIT 100""").param(c.id()).query((rs, i) -> submissionRow(rs, false)).list();
    }

    private static Map<String, Object> submissionRow(java.sql.ResultSet rs, boolean withCircle) throws java.sql.SQLException {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", rs.getString("id"));
        if (withCircle) {
            r.put("circle", rs.getString("circle_name"));
            r.put("circleSlug", rs.getString("circle_slug"));
        }
        r.put("cat", rs.getString("cat"));
        r.put("text", rs.getString("text"));
        r.put("status", rs.getString("status"));
        r.put("crisis", rs.getBoolean("crisis"));
        if (!withCircle && rs.getString("ai_draft") != null) r.put("aiDraft", rs.getString("ai_draft"));
        if (rs.getString("reason") != null) r.put("reason", rs.getString("reason"));
        if (rs.getString("reply") != null) r.put("reply", rs.getString("reply"));
        r.put("createdAt", Db.msReq(rs, "created_at"));
        Long decided = Db.ms(rs, "decided_at");
        if (decided != null) r.put("decidedAt", decided);
        Integer no = rs.getObject("post_no", Integer.class);
        if (no != null) {
            r.put("postNo", no);
            r.put("postId", rs.getString("post_id"));
            r.put("publishAt", Db.msReq(rs, "publish_at"));
        }
        return r;
    }

    @Transactional
    public Draft draft(DbUser me, String slug, String id) {
        Circle c = bySlug(slug);
        requireKeeper(c, me);
        String text = jdbc.sql("SELECT text FROM submissions WHERE id = ? AND community_id = ?").param(id).param(c.id()).query(String.class).optional()
            .orElseThrow(() -> ApiException.notFound("사연을 찾을 수 없어요"));
        Draft d = tidy(text);
        jdbc.sql("UPDATE submissions SET ai_draft = ? WHERE id = ?").param(d.text()).param(id).update();
        return d;
    }

    /** 게시·보류·반려. 게시하면 소로우의 다음 #번호로, 게시 시각은 10~90분 무작위로 늦춘다 */
    @Transactional
    public List<Map<String, Object>> decide(DbUser me, String slug, String id, String action, String text, String reason, String reply) {
        Circle c = bySlug(slug);
        requireKeeper(c, me);
        record Sub(String authorId, String cat, String text, String status) {}
        Sub s = jdbc.sql("SELECT author_id, cat, text, status FROM submissions WHERE id = ? AND community_id = ? FOR UPDATE").param(id).param(c.id())
            .query((rs, i) -> new Sub(rs.getString("author_id"), rs.getString("cat"), rs.getString("text"), rs.getString("status"))).optional()
            .orElseThrow(() -> ApiException.notFound("사연을 찾을 수 없어요"));
        if (!"pending".equals(s.status()) && !"held".equals(s.status())) throw ApiException.badRequest("이미 처리한 사연이에요");
        String rep = clip(reply, 300);
        switch (action == null ? "" : action) {
            case "publish" -> {
                String body = text == null || text.isBlank() ? s.text() : text.strip();
                if (body.length() > 1200) body = body.substring(0, 1200);
                int no = jdbc.sql("UPDATE communities SET post_seq = post_seq + 1 WHERE id = ? RETURNING post_seq").param(c.id()).query(Integer.class).single();
                String postId = Ids.uid();
                LocalDateTime at = LocalDateTime.now(ZoneOffset.UTC).plusMinutes(CircleLogic.publishDelayMinutes(RANDOM));
                jdbc.sql("INSERT INTO shout_posts (id, author_id, cat, text, images, community_id, post_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
                    .param(postId).param(s.authorId()).param(s.cat()).param(body).param(new String[0]).param(c.id()).param(no).param(at).update();
                jdbc.sql("UPDATE submissions SET status = 'published', post_id = ?, reply = COALESCE(CAST(? AS VARCHAR), reply), reason = NULL, decided_at = now() WHERE id = ?")
                    .param(postId).param(rep).param(id).update();
                badges.refresh(s.authorId());
            }
            case "hold" -> jdbc.sql("UPDATE submissions SET status = 'held', reason = ?, reply = COALESCE(CAST(? AS VARCHAR), reply), decided_at = now() WHERE id = ?")
                .param(clip(reason, 200)).param(rep).param(id).update();
            case "reject" -> {
                String r = clip(reason, 200);
                if (r == null) throw ApiException.badRequest("반려 사유를 적어 주세요 (보낸 사람에게 보여요)");
                jdbc.sql("UPDATE submissions SET status = 'rejected', reason = ?, reply = COALESCE(CAST(? AS VARCHAR), reply), decided_at = now() WHERE id = ?")
                    .param(r).param(rep).param(id).update();
            }
            default -> throw ApiException.badRequest("알 수 없는 동작이에요");
        }
        return queue(me, slug, "pending");
    }

    private static String clip(String s, int max) {
        if (s == null || s.isBlank()) return null;
        String t = s.strip();
        return t.length() > max ? t.substring(0, max) : t;
    }

    /** 소로우지기: 이 소로우에 게시된 사연 가리기/되돌리기 */
    @Transactional
    public Map<String, Object> toggleHidden(DbUser me, String slug, String postId) {
        Circle c = bySlug(slug);
        requireKeeper(c, me);
        int n = jdbc.sql("UPDATE shout_posts SET hidden = NOT hidden, reviewed_at = now() WHERE id = ? AND community_id = ?").param(postId).param(c.id()).update();
        if (n == 0) throw ApiException.notFound("이 소로우의 사연이 아니에요");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("hidden", jdbc.sql("SELECT hidden FROM shout_posts WHERE id = ?").param(postId).query(Boolean.class).single());
        return out;
    }

    /** 내 사연함: 내가 보낸 사연의 상태·사유·익명 답장 */
    public List<Map<String, Object>> mySubmissions(DbUser me) {
        return jdbc.sql("""
            SELECT s.id, s.cat, s.text, s.status, s.crisis, s.ai_draft, s.reason, s.reply, s.created_at, s.decided_at,
                   p.post_no, p.id AS post_id, p.created_at AS publish_at, c.name AS circle_name, c.slug AS circle_slug
              FROM submissions s JOIN communities c ON c.id = s.community_id LEFT JOIN shout_posts p ON p.id = s.post_id
             WHERE s.author_id = ? ORDER BY s.created_at DESC LIMIT 100""").param(me.id())
            .query((rs, i) -> submissionRow(rs, true)).list();
    }
}
