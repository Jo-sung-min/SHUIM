package kr.co.shuim.payment;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Provider status is re-read after restarts and for refunds; untrusted client statuses are never accepted. */
@Component
@EnableScheduling
public class PaymentReconciler {
    private static final Logger log = LoggerFactory.getLogger(PaymentReconciler.class);
    private final PaymentService payments;
    public PaymentReconciler(PaymentService payments) { this.payments = payments; }

    @Scheduled(initialDelayString = "${app.payments.reconcile-delay-ms:60000}", fixedDelayString = "${app.payments.reconcile-delay-ms:60000}")
    public void reconcile() {
        try { payments.reconcileDue(); }
        catch (RuntimeException unavailable) { log.warn("불씨팝 결제 상태 동기화를 다음 주기에 다시 시도합니다."); }
    }
}
