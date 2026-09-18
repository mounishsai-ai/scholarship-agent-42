-- Roll the seeded 2025-26 cycle forward to 2026-27 (run once, after seed.sql + seed_cohort.py).
--
-- Plan dates (academic year, term, scheme closing dates, fee due dates) move exactly +1 year.
-- Event dates (applications, disbursements, payments, reminders) must stay in the past, so
-- they are mapped from [2025-07-01, last seeded event] onto [2026-07-01, today - 3 days]:
-- order is kept, so opens <= applied_on <= disbursed_on still holds. Scheme opening dates use
-- the same mapping, which keeps every application inside its window while the windows
-- (closing Oct-Dec 2026) are open.
-- Only the seeded rows are touched: agentops runs, eligibility checks, flags and term results
-- keep their real dates. Guarded on the year label, so a second run is a no-op.
-- The ids stay the same, so ACADEMIC_YEAR_ID in the engine does not change.
BEGIN;

DO $$
DECLARE
    y       constant uuid := 'a4200000-0000-0000-0000-000000000020';
    old0    constant date := '2025-07-01';
    new0    constant date := '2026-07-01';
    old_end date;
    ratio   numeric;
    n       int;
BEGIN
    IF (SELECT label FROM core.academic_year WHERE academic_year_id = y) IS DISTINCT FROM '2025-26' THEN
        RAISE NOTICE 'academic year is not 2025-26: nothing to roll';
        RETURN;
    END IF;

    SELECT greatest(
        (SELECT max(greatest(applied_on, coalesce(disbursed_on, applied_on)))
           FROM finance.scholarship_application WHERE academic_year_id = y AND applied_on < new0),
        (SELECT max(paid_on) FROM finance.payment WHERE paid_on < new0),
        (SELECT max(sent_at::date) FROM finance.reminder_dispatch WHERE sent_at < new0))
      INTO old_end;
    ratio := ((current_date - 3) - new0)::numeric / greatest(old_end - old0, 1);
    IF ratio <= 0 THEN
        RAISE EXCEPTION 'today (%) is too early in 2026-27 to roll forward', current_date;
    END IF;

    CREATE TEMP TABLE _map ON COMMIT DROP AS
    SELECT d::date AS old_d, (new0 + round((d::date - old0) * ratio)::int) AS new_d
    FROM generate_series(old0, old_end, interval '1 day') d;

    UPDATE core.academic_year
       SET label = '2026-27', start_date = start_date + interval '1 year',
           end_date = end_date + interval '1 year'
     WHERE academic_year_id = y;

    UPDATE core.term
       SET label = replace(label, '2025-26', '2026-27'),
           start_date = start_date + interval '1 year', end_date = end_date + interval '1 year',
           instruction_end = instruction_end + interval '1 year'
     WHERE academic_year_id = y;

    -- the four seeded schemes (test / officer-added schemes already carry current dates)
    UPDATE finance.scholarship_scheme sc
       SET application_opens = coalesce((SELECT new_d FROM _map WHERE old_d = sc.application_opens),
                                        sc.application_opens + interval '1 year'),
           application_closes = sc.application_closes + interval '1 year'
     WHERE sc.application_closes < new0;

    UPDATE finance.scholarship_application a
       SET applied_on = (SELECT new_d FROM _map WHERE old_d = a.applied_on),
           disbursed_on = (SELECT new_d FROM _map WHERE old_d = a.disbursed_on),
           external_application_no = replace(a.external_application_no, '2025', '2026')
     WHERE a.academic_year_id = y AND a.applied_on < new0;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'applications rolled: %', n;

    UPDATE finance.payment p
       SET paid_on = (SELECT new_d FROM _map WHERE old_d = p.paid_on),
           received_on = (SELECT new_d FROM _map WHERE old_d = p.received_on),
           reconciled_at = (SELECT new_d FROM _map WHERE old_d = p.reconciled_at::date)
                           + (p.reconciled_at - p.reconciled_at::date),
           transaction_ref = replace(p.transaction_ref, '2025', '2026')
     WHERE p.paid_on < new0;

    UPDATE finance.fee_demand
       SET due_date = due_date + interval '1 year'
     WHERE academic_year_id = y AND due_date < new0;

    UPDATE finance.reminder_dispatch r
       SET sent_at = (SELECT new_d FROM _map WHERE old_d = r.sent_at::date)
                     + (r.sent_at - r.sent_at::date)
     WHERE r.sent_at < new0;

    -- latest attendance snapshot: dated inside the new term, never in the future
    UPDATE attendance.attendance_summary
       SET as_of_date = least(date '2026-09-01', current_date)
     WHERE as_of_date >= old0 AND as_of_date < new0;

    -- nothing that already happened may be dated after today
    IF EXISTS (SELECT 1 FROM finance.scholarship_application
                WHERE applied_on > current_date OR disbursed_on > current_date
                   OR disbursed_on < applied_on) THEN
        RAISE EXCEPTION 'check failed: application dates';
    END IF;
    IF EXISTS (SELECT 1 FROM finance.scholarship_application a
                 JOIN finance.scholarship_scheme sc USING (scholarship_scheme_id)
                WHERE a.academic_year_id = y AND a.applied_on < sc.application_opens) THEN
        RAISE EXCEPTION 'check failed: application before its window opened';
    END IF;
    IF EXISTS (SELECT 1 FROM finance.payment WHERE paid_on > current_date)
       OR EXISTS (SELECT 1 FROM finance.reminder_dispatch WHERE sent_at > now()) THEN
        RAISE EXCEPTION 'check failed: payment / reminder in the future';
    END IF;
END $$;

COMMIT;
