package kr.co.shuim.circle;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import kr.co.shuim.ai.OpenAiClient;
import kr.co.shuim.ai.Crisis;
import kr.co.shuim.ai.JsonText;
import kr.co.shuim.auth.DbUser;
import kr.co.shuim.common.Db;
import kr.co.shuim.common.Ids;
import kr.co.shuim.common.SpaceCapacity;
import kr.co.shuim.common.SpaceMaps;
import kr.co.shuim.community.CommunityLogic;
import kr.co.shuim.config.ApiException;
import kr.co.shuim.profile.BadgeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;

/**
 * 커뮤니티 소로우: 미식·자취·싱글·자영업처럼 즐기는 일, 살아가는 일, 사람의 근본 고민으로 모여 힘든 점을 털어놓는 곳.
 * 소로우는 로그인한 누구나 열고(연 사람이 소로우지기, 묶음도 그때 새로 만들 수 있다), 누구나 가입·리스닝하고 사연을 보내면 소로우지기가 검토해 '#번호'로 게시한다.
 * 게시된 사연은 shout_posts(community_id, post_no)로 들어가 외침과 같은 힘내요·댓글·신고·배지를 쓴다.
 * 보낸 사람(author_id)은 소로우지기 화면과 다른 사람의 화면 어디에도 내려가지 않는다.
 */
@Service
public class CircleService {
    private static final Logger log = LoggerFactory.getLogger(CircleService.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcClient jdbc;
    private final MailService mail;
    private final OpenAiClient ai;
    private final ObjectMapper json;
    private final BadgeService badges;
    private boolean privateTestCreationEnabled;

    public CircleService(JdbcClient jdbc, MailService mail, OpenAiClient ai, ObjectMapper json, BadgeService badges) {
        this.jdbc = jdbc;
        this.mail = mail;
        this.ai = ai;
        this.json = json;
        this.badges = badges;
    }

    @Value("${app.circle.private-test-creation-enabled:false}")
    void setPrivateTestCreationEnabled(boolean enabled) {
        this.privateTestCreationEnabled = enabled;
    }

    public Map<String, Object> privateTestStatus(DbUser me) {
        if (!appAdmin(me)) throw ApiException.forbidden("운영진만 확인할 수 있어요");
        return Map.of("enabled", privateTestCreationEnabled);
    }

    /* ---------- 모양 ---------- */

    public record Circle(String id, String slug, String name, String kind, String domain, boolean verified, String joinMode, String visibility,
                         String intro, String notice, String createdBy, int postSeq, long createdAt, int memberCount, int listenerCount, boolean sample,
                         boolean privateTest, boolean pinned, int spaceCapacity, String icon, Long iconAt, String kindLabel) {
        public Circle {
            spaceCapacity = SpaceCapacity.effective(spaceCapacity);
        }

        public Circle(String id, String slug, String name, String kind, String domain, boolean verified, String joinMode, String visibility,
                      String intro, String notice, String createdBy, int postSeq, long createdAt, int memberCount, int listenerCount, boolean sample,
                      boolean privateTest, boolean pinned, int spaceCapacity, String icon, Long iconAt) {
            this(id, slug, name, kind, domain, verified, joinMode, visibility, intro, notice, createdBy, postSeq,
                createdAt, memberCount, listenerCount, sample, privateTest, pinned, spaceCapacity, icon, iconAt, null);
        }

        public Circle(String id, String slug, String name, String kind, String domain, boolean verified, String joinMode, String visibility,
                      String intro, String notice, String createdBy, int postSeq, long createdAt, int memberCount, int listenerCount, boolean sample,
                      boolean privateTest, boolean pinned, int spaceCapacity) {
            this(id, slug, name, kind, domain, verified, joinMode, visibility, intro, notice, createdBy, postSeq,
                createdAt, memberCount, listenerCount, sample, privateTest, pinned, spaceCapacity, null, null);
        }

        public Circle(String id, String slug, String name, String kind, String domain, boolean verified, String joinMode, String visibility,
                      String intro, String notice, String createdBy, int postSeq, long createdAt, int memberCount, int listenerCount, boolean sample) {
            this(id, slug, name, kind, domain, verified, joinMode, visibility, intro, notice, createdBy, postSeq,
                createdAt, memberCount, listenerCount, sample, false, false, SpaceCapacity.MAX);
        }

        /** 소로우 공간에서 이 풍경이 열렸는지. 참여자가 고정된 비공개 테스트 소로우는 늘 수 없으므로 모두 열어 둔다. */
        public boolean opensMap(String mapId) { return privateTest || SpaceMaps.open(mapId, memberCount); }
    }

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
        if (c.kindLabel() != null) m.put("kindLabel", c.kindLabel());
        if (c.domain() != null) m.put("domain", c.domain());
        m.put("verified", c.verified());
        m.put("joinMode", c.joinMode());
        m.put("visibility", c.visibility());
        m.put("privateTest", c.privateTest());
        m.put("pinned", c.pinned());
        m.put("spaceCapacity", c.spaceCapacity());
        m.put("intro", c.intro());
        m.put("notice", c.notice());
        if (c.icon() != null) m.put("icon", c.icon());
        if (c.iconAt() != null) m.put("iconUrl", "/api/circles/" + c.slug() + "/icon?v=" + c.iconAt());
        m.put("memberCount", c.memberCount());
        m.put("listenerCount", c.listenerCount());
        m.put("postCount", c.postSeq());
        if (c.sample()) m.put("sample", true);
        m.put("createdAt", c.createdAt());
        return m;
    }

    /** 소로우 공간의 풍경마다 열렸는지와 열리는 멤버 수 (소로우 하나·내 소로우에만 붙인다) */
    static List<Map<String, Object>> spaceMaps(Circle c) {
        List<Map<String, Object>> maps = new ArrayList<>();
        for (String id : SpaceMaps.ORDER) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", id);
            m.put("open", c.opensMap(id));
            m.put("members", SpaceMaps.membersToOpen(id));
            maps.add(m);
        }
        return maps;
    }

    /** 누구나 들어오는 공용 공간. 화면은 이 값이 있을 때만 공용 풍경을 보여 준다 */
    static Map<String, Object> publicSpace() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", SpaceMaps.PUBLIC_ID);
        m.put("name", SpaceMaps.PUBLIC_NAME);
        m.put("capacity", SpaceCapacity.MAX);
        return m;
    }

    private static final String CIRCLE_SELECT = """
        SELECT c.*,
               (SELECT count(*) FROM community_members m WHERE m.community_id = c.id AND m.status = 'active')::int AS member_count,
               (SELECT count(*) FROM community_follows f WHERE f.community_id = c.id)::int AS listener_count,
               (SELECT g.label FROM circle_groups g WHERE g.id = c.kind) AS kind_label
          FROM communities c""";

    private static Circle circleRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Circle(rs.getString("id"), rs.getString("slug"), rs.getString("name"), rs.getString("kind"), rs.getString("domain"), rs.getBoolean("verified"),
            rs.getString("join_mode"), rs.getString("visibility"), rs.getString("intro"), rs.getString("notice"), rs.getString("created_by"), rs.getInt("post_seq"),
            Db.msReq(rs, "created_at"), rs.getInt("member_count"), rs.getInt("listener_count"), rs.getBoolean("sample"),
            rs.getBoolean("private_test"), rs.getBoolean("pinned"), rs.getInt("space_capacity"), rs.getString("icon"), nullableLong(rs, "icon_at"), rs.getString("kind_label"));
    }

    private static Long nullableLong(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    public Circle bySlug(String slug) {
        return jdbc.sql(CIRCLE_SELECT + " WHERE c.slug = ? AND c.closed_at IS NULL").param(slug == null ? "" : slug.toLowerCase(Locale.ROOT))
            .query((rs, i) -> circleRow(rs)).optional().orElseThrow(() -> ApiException.notFound("소로우를 찾을 수 없어요"));
    }

    /** 다른 기능이 소로우의 고유 id 로 접근할 때도 실제로 존재하는 소로우인지 확인한다. */
    public Circle byId(String id) {
        return jdbc.sql(CIRCLE_SELECT + " WHERE c.id = ? AND c.closed_at IS NULL").param(id)
            .query((rs, i) -> circleRow(rs)).optional().orElseThrow(() -> ApiException.notFound("소로우를 찾을 수 없어요"));
    }

    public Optional<Member> member(String circleId, String userId) {
        if (userId == null) return Optional.empty();
        return jdbc.sql("""
            SELECT m.role, m.status, m.is_primary, m.verified_at FROM community_members m
              JOIN communities c ON c.id = m.community_id
             WHERE m.community_id = ? AND m.user_id = ? AND (NOT c.private_test OR EXISTS (
                SELECT 1 FROM community_private_members pm JOIN users u ON u.id = pm.user_id
                 WHERE pm.community_id = c.id AND pm.user_id = m.user_id AND NOT u.is_anonymous AND u.blocked_at IS NULL))
            """).param(circleId).param(userId)
            .query((rs, i) -> new Member(rs.getString("role"), rs.getString("status"), rs.getBoolean("is_primary"), rs.getObject("verified_at") != null)).optional();
    }

    private static String viewerId(DbUser viewer) {
        return viewer != null && !viewer.anonymous() && !viewer.blocked() ? viewer.id() : null;
    }

    private static final String VISIBLE_CIRCLE = PrivateCircleAccess.visibleTo("c", ":viewerId") + " AND c.closed_at IS NULL";

    public boolean canAccess(Circle circle, DbUser viewer) {
        if (!circle.privateTest()) return true;
        String id = viewerId(viewer);
        boolean allowed = id != null && jdbc.sql("""
            SELECT count(*) FROM community_private_members pm JOIN users u ON u.id = pm.user_id
             WHERE pm.community_id = ? AND pm.user_id = ? AND NOT u.is_anonymous AND u.blocked_at IS NULL
            """).param(circle.id()).param(id).query(Long.class).single() > 0;
        return CircleLogic.canAccessPrivate(true, id != null, allowed);
    }

    /** Used by map entry and every circle-specific operation, including administrative ones. */
    public void requireAccess(Circle circle, DbUser viewer) {
        if (!canAccess(circle, viewer)) throw ApiException.notFound("소로우를 찾을 수 없어요");
    }

    private static boolean appAdmin(DbUser u) { return u != null && "admin".equals(u.role()) && !u.anonymous() && !u.blocked(); }

    private Member requireKeeper(Circle c, DbUser me) {
        requireAccess(c, me);
        Member m = member(c.id(), me.id()).orElse(null);
        if (m != null && m.keeper()) return m;
        if (appAdmin(me)) return new Member("keeper", "active", false, true);
        throw ApiException.forbidden("소로우지기만 할 수 있어요");
    }

    public Member requireActiveMember(Circle c, DbUser me) {
        requireAccess(c, me);
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
        return browse(null, kind, q);
    }

    public List<Map<String, Object>> browse(DbUser viewer, String kind, String q) {
        String k = CircleLogic.isGroupId(kind) ? kind : null;
        String query = q == null ? "" : q.strip();
        return jdbc.sql(CIRCLE_SELECT + " WHERE " + VISIBLE_CIRCLE + " AND (CAST(:kind AS VARCHAR) IS NULL OR c.kind = :kind) AND (:q = '' OR c.name ILIKE '%' || :q || '%') ORDER BY c.pinned DESC, c.created_at, c.slug LIMIT 60")
            .param("viewerId", viewerId(viewer)).param("kind", k).param("q", query)
            .query((rs, i) -> circleRow(rs)).list().stream()
            .map(this::view).toList();
    }

    /** 내가 속한 소로우 (대표 먼저) + 리스닝 중인 소로우 */
    public Map<String, Object> mine(DbUser me) {
        List<Map<String, Object>> member = new ArrayList<>();
        jdbc.sql(CIRCLE_SELECT.replace("SELECT c.*,", "SELECT c.*, mm.role, mm.status, mm.is_primary,") + " JOIN community_members mm ON mm.community_id = c.id WHERE mm.user_id = :userId AND " + VISIBLE_CIRCLE + " ORDER BY c.pinned DESC, mm.is_primary DESC, mm.joined_at")
            .param("userId", me.id()).param("viewerId", viewerId(me)).query((rs, i) -> {
                Circle c = circleRow(rs);
                Map<String, Object> v = view(c);
                v.put("spaceMaps", spaceMaps(c));
                v.put("role", rs.getString("role"));
                v.put("status", rs.getString("status"));
                v.put("primary", rs.getBoolean("is_primary"));
                return v;
            }).list().forEach(member::add);
        List<Map<String, Object>> listening = jdbc.sql(CIRCLE_SELECT + " JOIN community_follows ff ON ff.community_id = c.id WHERE ff.user_id = :userId AND " + VISIBLE_CIRCLE + " ORDER BY c.pinned DESC, ff.created_at DESC")
            .param("userId", me.id()).param("viewerId", viewerId(me)).query((rs, i) -> view(circleRow(rs))).list();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("member", member);
        out.put("listening", listening);
        out.put("publicSpace", publicSpace());
        return out;
    }

    /** 이번 주 가장 따뜻한 소로우: 지난 7일 동안 멤버들이 다른 소로우·광장 글에 남긴 위로 댓글이 많은 순 (횟수는 내려보내지 않는다) */
    public List<Map<String, Object>> warmest() {
        return warmest(null);
    }

    public List<Map<String, Object>> warmest(DbUser viewer) {
        List<String> ids = jdbc.sql("""
            SELECT m.community_id, count(*) AS n
              FROM comments cm
              JOIN community_members m ON m.user_id = cm.author_id AND m.status = 'active'
              JOIN communities c ON c.id = m.community_id
              JOIN shout_posts sp ON cm.post_kind = 'post' AND sp.id = cm.post_id
              LEFT JOIN communities source_circle ON source_circle.id = sp.community_id
             WHERE cm.created_at > now() - INTERVAL '7 days' AND cm.hidden = FALSE AND sp.hidden = FALSE
               AND (sp.community_id IS NULL OR sp.community_id <> m.community_id)
            """ + " AND " + VISIBLE_CIRCLE + " AND (source_circle.id IS NULL OR " + PrivateCircleAccess.visibleTo("source_circle", ":viewerId") + ")"
            + " GROUP BY m.community_id, c.pinned ORDER BY c.pinned DESC, n DESC LIMIT 40")
            .param("viewerId", viewerId(viewer)).query((rs, i) -> rs.getString("community_id")).list();
        if (ids.isEmpty()) return List.of();
        Map<String, Circle> byId = new HashMap<>();
        jdbc.sql(CIRCLE_SELECT + " WHERE c.id IN (:ids) AND c.closed_at IS NULL").param("ids", ids).query((rs, i) -> circleRow(rs)).list().forEach(c -> byId.put(c.id(), c));
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
        requireAccess(c, viewer);
        Map<String, Object> out = view(c);
        out.put("spaceMaps", spaceMaps(c));
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

    /** kind: 고른 묶음 id. group: 새로 만들 묶음 이름 (있으면 kind 대신 쓴다) */
    public record CreateInput(String name, String slug, String kind, String intro, String joinMode, String visibility, String domain, String icon, String group) {
        public CreateInput(String name, String slug, String kind, String intro, String joinMode, String visibility, String domain, String icon) {
            this(name, slug, kind, intro, joinMode, visibility, domain, icon, null);
        }
        public CreateInput(String name, String slug, String kind, String intro, String joinMode, String visibility, String domain) {
            this(name, slug, kind, intro, joinMode, visibility, domain, null, null);
        }
    }

    /** The allowlist is fixed at creation; no invite, domain, keeper or global-admin bypass exists. */
    @Transactional
    public Map<String, Object> createPrivateTest(DbUser me, String peerId) {
        if (!appAdmin(me)) throw ApiException.forbidden("운영진만 테스트 소로우를 만들 수 있어요");
        if (!privateTestCreationEnabled) throw ApiException.unavailable("비공개 테스트 소로우는 아직 준비 중이에요. 준비가 끝난 뒤 다시 시도해 주세요");
        if (peerId == null || peerId.isBlank() || me.id().equals(peerId.strip())) {
            throw ApiException.badRequest("함께할 가입 회원 한 명을 골라 주세요");
        }
        String peer = peerId.strip();
        DbUser invited = jdbc.sql("SELECT * FROM users WHERE id = ?").param(peer).query(DbUser.MAPPER).optional()
            .orElseThrow(() -> ApiException.badRequest("함께할 가입 회원을 찾을 수 없어요"));
        if (invited.anonymous() || invited.blocked()) throw ApiException.badRequest("가입을 마친 이용 가능한 회원만 함께할 수 있어요");
        boolean canSignIn = jdbc.sql("SELECT password_hash IS NOT NULL OR kakao_id IS NOT NULL OR toss_user_key IS NOT NULL FROM users WHERE id = ?")
            .param(peer).query(Boolean.class).single();
        if (!canSignIn) throw ApiException.badRequest("로그인할 수 있는 가입 회원을 골라 주세요");

        // Serialize the fixed slug even before its first row exists, including lost-response retries.
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtext(?))").param(CircleLogic.PRIVATE_TEST_SLUG).query((rs, i) -> 1).single();
        Optional<Circle> existing = jdbc.sql(CIRCLE_SELECT + " WHERE c.slug = ?").param(CircleLogic.PRIVATE_TEST_SLUG)
            .query((rs, i) -> circleRow(rs)).optional();
        if (existing.isPresent()) {
            Circle circle = existing.get();
            if (!circle.privateTest() || !me.id().equals(circle.createdBy())) throw ApiException.notFound("소로우를 찾을 수 없어요");
            requireAccess(circle, me);
            Set<String> members = new HashSet<>(jdbc.sql("SELECT user_id FROM community_private_members WHERE community_id = ?")
                .param(circle.id()).query(String.class).list());
            if (!members.equals(Set.of(me.id(), peer))) throw ApiException.badRequest("이미 정해진 두 회원의 테스트 소로우가 있어요");
            return detail(me, circle.slug());
        }
        if (jdbc.sql("SELECT count(*) FROM communities WHERE name_key = ?").param(CircleLogic.nameKey(CircleLogic.PRIVATE_TEST_NAME)).query(Long.class).single() > 0) {
            throw ApiException.badRequest("같은 이름의 소로우가 이미 있어요");
        }
        String id = Ids.uid();
        jdbc.sql("""
            INSERT INTO communities (id, slug, name, name_key, kind, join_mode, visibility, intro, created_by, private_test, pinned, space_capacity)
            VALUES (?, ?, ?, ?, 'rest', 'invite', 'members', '두 사람이 함께 쉬어 가는 비공개 테스트 소로우예요.', ?, TRUE, TRUE, ?)
            """).param(id).param(CircleLogic.PRIVATE_TEST_SLUG).param(CircleLogic.PRIVATE_TEST_NAME)
            .param(CircleLogic.nameKey(CircleLogic.PRIVATE_TEST_NAME)).param(me.id()).param(CircleLogic.PRIVATE_TEST_CAPACITY).update();
        for (String userId : List.of(me.id(), peer)) {
            jdbc.sql("INSERT INTO community_private_members (community_id, user_id) VALUES (?, ?)").param(id).param(userId).update();
            // A test membership must not replace either person's public primary circle.
            jdbc.sql("INSERT INTO community_members (community_id, user_id, role, status, is_primary) VALUES (?, ?, ?, 'active', FALSE)")
                .param(id).param(userId).param(me.id().equals(userId) ? "owner" : "member").update();
        }
        return detail(me, CircleLogic.PRIVATE_TEST_SLUG);
    }

    @Transactional
    public Map<String, Object> create(DbUser me, CreateInput in) {
        // 오픈채팅방처럼 누구나 연다. 연 사람이 소로우지기(owner)가 되어 이름·아이콘·가입 방식·멤버까지 관리한다
        assertNotBlocked(me);
        String name = CircleLogic.normalizeName(in.name());
        if (name == null) throw ApiException.badRequest("이름은 2~26자로 해요 (끝에 '소로우'가 붙어요)");
        if (CircleLogic.offensive(name)) throw ApiException.badRequest("이름에 쓸 수 없는 말이 들어 있어요");
        String slug = CircleLogic.normalizeSlug(in.slug());
        if (slug == null) throw ApiException.badRequest("주소는 영문 소문자·숫자·하이픈 3~40자로 해요 (예: korea-univ)");
        if (CircleLogic.PRIVATE_TEST_SLUG.equals(slug) || CircleLogic.nameKey(CircleLogic.PRIVATE_TEST_NAME).equals(CircleLogic.nameKey(name))) {
            throw ApiException.badRequest("이 이름과 주소는 비공개 테스트 소로우 전용이에요");
        }
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
        String icon = CircleLogic.normalizeIcon(in.icon());
        // 묶음은 마지막에: 앞의 검사에서 막히면 새 묶음도 만들어지지 않는다 (같은 트랜잭션)
        String kind = resolveGroup(me, in.kind(), in.group());
        String id = Ids.uid();
        jdbc.sql("""
            INSERT INTO communities (id, slug, name, name_key, kind, domain, join_mode, visibility, intro, invite_code, created_by, space_capacity, icon)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""")
            .param(id).param(slug).param(name).param(key).param(kind).param(domain).param(joinMode).param(visibility).param(intro)
            .param("invite".equals(joinMode) ? inviteCode() : null).param(me.id()).param(SpaceCapacity.MAX).param(icon).update();
        boolean hasPrimary = jdbc.sql("SELECT count(*) FROM community_members WHERE user_id = ? AND is_primary").param(me.id()).query(Long.class).single() > 0;
        jdbc.sql("INSERT INTO community_members (community_id, user_id, role, status, is_primary) VALUES (?, ?, 'owner', 'active', ?)")
            .param(id).param(me.id()).param(!hasPrimary).update();
        badges.refresh(me.id());
        return detail(me, slug);
    }

    /* ---------- 묶음 ---------- */

    /** 소로우를 열 때 고른 묶음 id, 또는 새 묶음 이름으로 묶음을 찾거나 만든다. 같은 이름(공백·가운뎃점·대소문자 무시)은 있는 묶음으로 합친다 */
    String resolveGroup(DbUser me, String kindId, String groupLabel) {
        if (groupLabel != null && !groupLabel.isBlank()) {
            String label = CircleLogic.normalizeGroupLabel(groupLabel);
            if (label == null) throw ApiException.badRequest("묶음 이름은 2~10자 한글·영문·숫자로 해요");
            if (CircleLogic.offensive(label)) throw ApiException.badRequest("묶음 이름에 쓸 수 없는 말이 들어 있어요");
            if (CircleLogic.affiliationLabel(label)) throw ApiException.badRequest("회사·학교 같은 소속 이름은 묶음으로 만들지 않아요");
            String key = CircleLogic.groupKey(label);
            Optional<String> existing = groupIdByKey(key);
            if (existing.isPresent()) return existing.get();
            // 동시에 같은 이름을 만들면 label_key UNIQUE 가 하나만 남기고, 나머지는 그 묶음을 쓴다
            jdbc.sql("INSERT INTO circle_groups (id, label, label_key, created_by) VALUES (?, ?, ?, ?) ON CONFLICT (label_key) DO NOTHING")
                .param(CircleLogic.newGroupId(RANDOM)).param(label).param(key).param(me.id()).update();
            return groupIdByKey(key).orElseThrow(() -> ApiException.badRequest("묶음을 만들지 못했어요. 다시 시도해 주세요"));
        }
        if (CircleLogic.isGroupId(kindId) && jdbc.sql("SELECT count(*) FROM circle_groups WHERE id = ?").param(kindId).query(Long.class).single() > 0) return kindId;
        throw ApiException.badRequest("묶음을 골라 주세요");
    }

    private Optional<String> groupIdByKey(String key) {
        return jdbc.sql("SELECT id FROM circle_groups WHERE label_key = ?").param(key).query(String.class).optional();
    }

    static final int GROUPS_LIMIT = 30;

    /**
     * 묶음 목록. q 가 없으면 기본 묶음 + 소로우가 있는 새 묶음(소로우 많은 순 GROUPS_LIMIT 개),
     * q 가 있으면 이름에 q 가 들어간 묶음(소로우가 아직 없어도) — 소로우를 열 때 같은 묶음을 먼저 보여 주려고.
     */
    public List<Map<String, Object>> groups(DbUser viewer, String q) {
        String query = q == null ? "" : q.strip();
        if (query.length() > 20) return List.of();
        String qKey = query.isEmpty() ? "" : CircleLogic.groupKey(query);
        record Row(String id, String label, String hint, boolean builtin, int sort, int count) {}
        List<Row> rows = jdbc.sql("SELECT g.id, g.label, g.hint, g.builtin, g.sort_order, "
                + "(SELECT count(*) FROM communities c WHERE c.kind = g.id AND " + VISIBLE_CIRCLE + ")::int AS circle_count "
                + "FROM circle_groups g WHERE (:qKey = '' OR position(:qKey IN g.label_key) > 0)")
            .param("viewerId", viewerId(viewer)).param("qKey", qKey)
            .query((rs, i) -> new Row(rs.getString("id"), rs.getString("label"), rs.getString("hint"), rs.getBoolean("builtin"),
                rs.getInt("sort_order"), rs.getInt("circle_count"))).list();
        List<Row> sorted = rows.stream().sorted(Comparator.comparing((Row r) -> !r.builtin())
            .thenComparingInt(r -> r.builtin() ? r.sort() : -r.count())
            .thenComparing(Row::label)).toList();
        List<Map<String, Object>> out = new ArrayList<>();
        int free = 0;
        for (Row r : sorted) {
            if (!r.builtin()) {
                if (query.isEmpty() && r.count() == 0) continue;
                if (++free > GROUPS_LIMIT) break;
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.id());
            m.put("label", r.label());
            if (!r.hint().isEmpty()) m.put("hint", r.hint());
            m.put("builtin", r.builtin());
            m.put("circleCount", r.count());
            out.add(m);
        }
        return out;
    }

    private static String inviteCode() {
        String abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 8; i++) sb.append(abc.charAt(RANDOM.nextInt(abc.length())));
        return sb.toString();
    }

    /** 올린 아이콘 사진 (png/jpeg/webp data URL, ICON_MAX_BYTES 이하). bytes 는 내려줄 때만 채운다 */
    public record Image(String type, String base64, byte[] bytes) {}
    private static final java.util.regex.Pattern ICON_DATA_URL =
        java.util.regex.Pattern.compile("^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\\s]+)$", java.util.regex.Pattern.CASE_INSENSITIVE);

    static Image decodeIcon(String dataUrl) {
        var m = ICON_DATA_URL.matcher(dataUrl.strip());
        if (!m.matches()) throw ApiException.badRequest("PNG·JPEG·WebP 이미지만 올릴 수 있어요");
        String base64 = m.group(2).replaceAll("\\s", "");
        byte[] bytes;
        try { bytes = Base64.getDecoder().decode(base64); }
        catch (IllegalArgumentException e) { throw ApiException.badRequest("이미지 형식을 읽지 못했어요"); }
        if (bytes.length == 0) throw ApiException.badRequest("빈 이미지예요");
        if (bytes.length > CircleLogic.ICON_MAX_BYTES) throw ApiException.badRequest("아이콘 사진은 " + (CircleLogic.ICON_MAX_BYTES / 1024) + "KB 이하로 올려요");
        return new Image(m.group(1).toLowerCase(Locale.ROOT), base64, bytes);
    }

    /** GET /api/circles/{slug}/icon 용 바이트 */
    public Optional<Image> icon(String slug) {
        return jdbc.sql("SELECT icon_type, icon_data FROM communities WHERE slug = ? AND icon_data IS NOT NULL").param(slug)
            .query((rs, i) -> { String b64 = rs.getString("icon_data"); return new Image(rs.getString("icon_type"), b64, Base64.getDecoder().decode(b64)); })
            .optional();
    }

    /** 설정: 소로우지기는 공지만, 연 사람은 이름·아이콘·소개·가입 방식·공개 범위·초대 코드까지 */
    @Transactional
    public Map<String, Object> update(DbUser me, String slug, Map<String, Object> b) {
        Circle c = bySlug(slug);
        Member m = requireKeeper(c, me);
        if (c.privateTest() && List.of("visibility", "joinMode", "regenerateInvite", "privateTest", "pinned", "spaceCapacity", "name").stream().anyMatch(b::containsKey)) {
            throw ApiException.badRequest("비공개 테스트 소로우의 공개 범위와 참여 설정은 바꿀 수 없어요");
        }
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
            if (b.get("name") instanceof String raw) {
                String name = CircleLogic.normalizeName(raw);
                if (name == null) throw ApiException.badRequest("이름은 2~26자로 해요 (끝에 '소로우'가 붙어요)");
                if (CircleLogic.offensive(name)) throw ApiException.badRequest("이름에 쓸 수 없는 말이 들어 있어요");
                String key = CircleLogic.nameKey(name);
                if (CircleLogic.nameKey(CircleLogic.PRIVATE_TEST_NAME).equals(key)) throw ApiException.badRequest("이 이름은 비공개 테스트 소로우 전용이에요");
                if (jdbc.sql("SELECT count(*) FROM communities WHERE name_key = ? AND id <> ?").param(key).param(c.id()).query(Long.class).single() > 0) {
                    throw ApiException.badRequest("같은 이름의 소로우가 이미 있어요");
                }
                jdbc.sql("UPDATE communities SET name = ?, name_key = ? WHERE id = ?").param(name).param(key).param(c.id()).update();
            }
            if (b.containsKey("icon")) {
                String picked = b.get("icon") instanceof String s ? CircleLogic.normalizeIcon(s) : null;
                jdbc.sql("UPDATE communities SET icon = ? WHERE id = ?").param(picked).param(c.id()).update();
            }
            if (b.containsKey("iconImage")) {
                if (b.get("iconImage") instanceof String dataUrl && !dataUrl.isBlank()) {
                    Image image = decodeIcon(dataUrl);
                    jdbc.sql("UPDATE communities SET icon_type = ?, icon_data = ?, icon_at = ? WHERE id = ?")
                        .param(image.type()).param(image.base64()).param(System.currentTimeMillis()).param(c.id()).update();
                } else {
                    jdbc.sql("UPDATE communities SET icon_type = NULL, icon_data = NULL, icon_at = NULL WHERE id = ?").param(c.id()).update();
                }
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
        } else if (b.containsKey("intro") || b.containsKey("visibility") || b.containsKey("joinMode") || b.containsKey("regenerateInvite") || b.containsKey("name") || b.containsKey("icon") || b.containsKey("iconImage")) {
            throw ApiException.forbidden("소로우를 연 사람만 바꿀 수 있어요");
        }
        return detail(me, slug);
    }

    /** 소로우 닫기 (연 사람만). 지우지 않고 closed_at 만 적어 둘러보기·내 소로우·바닷가에서 사라지게 한다. 올라간 사연은 그대로 남는다 */
    @Transactional
    public void close(DbUser me, String slug) {
        Circle c = bySlug(slug);
        Member m = requireKeeper(c, me);
        if (!(m.owner() || appAdmin(me))) throw ApiException.forbidden("소로우를 연 사람만 닫을 수 있어요");
        if (c.privateTest()) throw ApiException.badRequest("비공개 테스트 소로우는 닫을 수 없어요");
        jdbc.sql("UPDATE communities SET closed_at = ? WHERE id = ? AND closed_at IS NULL").param(System.currentTimeMillis()).param(c.id()).update();
        badges.refresh(me.id());
    }

    /* ---------- 가입·나가기·대표·리스닝 ---------- */

    @Transactional
    public Map<String, Object> join(DbUser me, String slug, String code) {
        assertNotBlocked(me);
        Circle c = bySlug(slug);
        requireAccess(c, me);
        Optional<Member> cur = member(c.id(), me.id());
        if (cur.isPresent()) return detail(me, slug);
        if (c.privateTest()) throw ApiException.forbidden("테스트 소로우의 참여자는 고정돼 있어요");
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
        requireAccess(c, me);
        if (c.privateTest()) throw ApiException.badRequest("테스트 소로우의 참여자는 고정돼 있어요");
        Member m = member(c.id(), me.id()).orElseThrow(() -> ApiException.badRequest("멤버가 아니에요"));
        if ("owner".equals(m.role())) throw ApiException.badRequest("소로우를 연 사람은 나갈 수 없어요");
        jdbc.sql("DELETE FROM community_members WHERE community_id = ? AND user_id = ?").param(c.id()).param(me.id()).update();
        return detail(me, slug);
    }

    @Transactional
    public Map<String, Object> setPrimary(DbUser me, String slug) {
        Circle c = bySlug(slug);
        requireActiveMember(c, me);
        if (c.privateTest()) throw ApiException.badRequest("비공개 테스트 소로우는 공개 프로필의 대표로 정할 수 없어요");
        jdbc.sql("UPDATE community_members SET is_primary = FALSE WHERE user_id = ? AND is_primary").param(me.id()).update();
        jdbc.sql("UPDATE community_members SET is_primary = TRUE WHERE user_id = ? AND community_id = ?").param(me.id()).param(c.id()).update();
        return detail(me, slug);
    }

    @Transactional
    public Map<String, Object> toggleFollow(DbUser me, String slug) {
        Circle c = bySlug(slug);
        requireAccess(c, me);
        int del = jdbc.sql("DELETE FROM community_follows WHERE user_id = ? AND community_id = ?").param(me.id()).param(c.id()).update();
        if (del == 0) jdbc.sql("INSERT INTO community_follows (user_id, community_id) VALUES (?, ?)").param(me.id()).param(c.id()).update();
        return detail(me, slug);
    }

    /* ---------- 소속 인증 (학교·회사 메일) ---------- */

    @Transactional
    public Map<String, Object> verifyStart(DbUser me, String slug, String email) {
        assertNotBlocked(me);
        Circle c = bySlug(slug);
        requireAccess(c, me);
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
        requireAccess(c, me);
        if (c.privateTest()) throw ApiException.badRequest("이 소로우는 메일 인증을 쓰지 않아요");
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
        if (c.privateTest()) throw ApiException.badRequest("테스트 소로우의 참여자는 고정돼 있어요");
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
        너는 커뮤니티 소로우(미식·자취·싱글·자영업처럼 즐기는 일, 살아가는 일, 마음의 고민으로 모인 익명 사연 공간)의 사연 정리 도우미야.
        사용자가 보낸 사연을 게시하기 좋게 다듬되, 쓴 사람의 말투와 1인칭 시점과 내용은 그대로 둬.
        - 띄어쓰기·맞춤법·문단만 정리해. 없는 사실을 더하거나 감정을 과장하지 마.
        - 사람을 특정할 수 있는 정보는 ○○ 로 가려: 실명, 학번·사번, 전화번호, 메일, 특정 수업·팀·부서 이름, 날짜와 장소가 합쳐져 한 사람을 가리키는 표현.
        - 회사·학교·기관 이름도 ○○ 로 가려. 여기서는 소속 대신 삶의 이야기로만 나눠 (소속 이름이 다른 사람에게 박탈감이 되지 않게).
        - 특정인을 비난·저격하는 문장은 그 사람이 드러나지 않게 가리기만 하고, 판단은 하지 마.
        - 1200자를 넘지 마.
        출력은 아래 JSON 하나만. 코드블록이나 다른 텍스트 없이.
        { "text": "정리한 사연", "masked": ["가린 정보의 종류 (예: 실명, 학번)"] }""";

    /** AI 정리 + 가림 제안. AI 가 없거나 실패하면 규칙 기반(공백 정리 + 실명·연락처 가리기) */
    public Draft tidy(String text) {
        String raw = text == null ? "" : text;
        CircleLogic.Masked rule = CircleLogic.mask(CircleLogic.tidy(raw));
        if (!ai.configured()) return new Draft(rule.text(), rule.found(), "local");
        try {
            String out = ai.complete(ai.resolveModel(null), 4000, DRAFT_PROMPT, "사연:\n" + raw);
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
             WHERE s.author_id = :userId AND """ + VISIBLE_CIRCLE + " ORDER BY s.created_at DESC LIMIT 100")
            .param("userId", me.id()).param("viewerId", viewerId(me))
            .query((rs, i) -> submissionRow(rs, true)).list();
    }
}
