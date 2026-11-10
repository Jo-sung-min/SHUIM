-- 카카오로 새로 가입하면 폭죽 이용권 5장을 한 줄로 준다. event_key 는 signup:kakao:<userId>
ALTER TABLE firework_ticket_ledger DROP CONSTRAINT firework_ticket_ledger_reason_check;
ALTER TABLE firework_ticket_ledger ADD CONSTRAINT firework_ticket_ledger_reason_check
    CHECK (reason IN ('points_buy', 'sponsor_cheer', 'launch', 'kakao_signup'));
ALTER TABLE firework_ticket_ledger DROP CONSTRAINT firework_ticket_ledger_amount_check;
ALTER TABLE firework_ticket_ledger ADD CONSTRAINT firework_ticket_ledger_amount_check
    CHECK (amount IN (-1, 1, 5));
