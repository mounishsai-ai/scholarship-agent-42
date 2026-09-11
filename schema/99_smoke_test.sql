-- =====================================================================
-- 99_smoke_test.sql : end-to-end proof that the model supports the
-- hardest workflow in the catalogue - CO/PO attainment traced back to
-- individual question marks - and that RLS isolates student data.
-- Not part of the production deployment.
-- =====================================================================
SET search_path = public;

-- Foundation
INSERT INTO core.institution (institution_id, code, name, type)
VALUES ('11111111-1111-1111-1111-111111111111','ACME','Acme Institute of Technology','AUTONOMOUS');

INSERT INTO core.department (department_id, institution_id, code, name)
VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','CSE','Computer Science and Engineering');

INSERT INTO core.academic_year (academic_year_id, institution_id, label, start_date, end_date, is_current)
VALUES ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','2025-26','2025-07-01','2026-06-30',true);

INSERT INTO core.term (term_id, academic_year_id, term_no, label, parity, start_date, end_date, status)
VALUES ('44444444-4444-4444-4444-444444444444','33333333-3333-3333-3333-333333333333',1,'ODD 2025-26','ODD','2025-07-15','2025-12-15','ACTIVE');

-- Curriculum
INSERT INTO curriculum.programme (programme_id, institution_id, department_id, code, name, level, degree, duration_years, total_terms, sanctioned_intake)
VALUES ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','BTCSE','B.Tech Computer Science and Engineering','UG','B.Tech',4,8,180);

INSERT INTO curriculum.regulation (regulation_id, institution_id, code, name, effective_from_admission_year, status)
VALUES ('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111','R23','Regulation 2023',2023,'ACTIVE');

INSERT INTO curriculum.batch (batch_id, programme_id, regulation_id, admission_year, label)
VALUES ('77777777-7777-7777-7777-777777777777','55555555-5555-5555-5555-555555555555','66666666-6666-6666-6666-666666666666',2024,'2024-28 CSE');

INSERT INTO curriculum.section (section_id, batch_id, code, year_of_study, strength)
VALUES ('88888888-8888-8888-8888-888888888888','77777777-7777-7777-7777-777777777777','A',2,60);

INSERT INTO curriculum.course (course_id, institution_id, owning_department_id, title)
VALUES ('99999999-9999-9999-9999-999999999999','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','Data Structures');

INSERT INTO curriculum.course_version (course_version_id, course_id, regulation_id, programme_id, course_code,
       term_no, year_of_study, course_category, course_type, credits, lecture_hours, tutorial_hours, practical_hours)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999999','66666666-6666-6666-6666-666666666666','55555555-5555-5555-5555-555555555555','CS301',3,2,'PCC','THEORY',3,3,1,0);

INSERT INTO curriculum.course_unit (course_unit_id, course_version_id, unit_no, title, notional_hours) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000101','aaaaaaaa-0000-0000-0000-000000000001',1,'Arrays and Linked Lists',10),
 ('aaaaaaaa-0000-0000-0000-000000000102','aaaaaaaa-0000-0000-0000-000000000001',2,'Trees and Graphs',12);

INSERT INTO curriculum.course_outcome (course_outcome_id, course_version_id, co_no, statement, bloom_level, target_level) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000201','aaaaaaaa-0000-0000-0000-000000000001',1,'Apply linear data structures to solve problems',3,2.00),
 ('aaaaaaaa-0000-0000-0000-000000000202','aaaaaaaa-0000-0000-0000-000000000001',2,'Analyse tree and graph algorithms',4,2.00);

INSERT INTO curriculum.programme_outcome (programme_outcome_id, programme_id, regulation_id, outcome_type, outcome_no, statement, target_level)
VALUES ('aaaaaaaa-0000-0000-0000-000000000301','55555555-5555-5555-5555-555555555555','66666666-6666-6666-6666-666666666666','PO',2,'Problem analysis',2.00);

INSERT INTO curriculum.co_po_map (course_outcome_id, programme_outcome_id, strength) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000201','aaaaaaaa-0000-0000-0000-000000000301',2),
 ('aaaaaaaa-0000-0000-0000-000000000202','aaaaaaaa-0000-0000-0000-000000000301',3);

-- People
INSERT INTO people.person (person_id, institution_id, full_name, gender) VALUES
 ('bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Asha Reddy','F'),
 ('bbbbbbbb-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Rahul Verma','M'),
 ('bbbbbbbb-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Dr Meera Iyer','F');

INSERT INTO people.student (student_id, person_id, admission_no, roll_no, batch_id, admission_date, current_section_id, current_year_of_study) VALUES
 ('cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','ADM2024001','24CSE001','77777777-7777-7777-7777-777777777777','2024-08-01','88888888-8888-8888-8888-888888888888',2),
 ('cccccccc-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','ADM2024002','24CSE002','77777777-7777-7777-7777-777777777777','2024-08-01','88888888-8888-8888-8888-888888888888',2);

INSERT INTO people.faculty (faculty_id, person_id, employee_no, department_id, designation, date_of_joining, is_phd_holder)
VALUES ('dddddddd-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000003','EMP1001','22222222-2222-2222-2222-222222222222','ASSOCIATE_PROFESSOR','2018-06-01',true);

INSERT INTO identity.app_user (user_id, person_id, username, email) VALUES
 ('eeeeeeee-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','24cse001','asha@acme.edu'),
 ('eeeeeeee-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','24cse002','rahul@acme.edu'),
 ('eeeeeeee-0000-0000-0000-000000000003','bbbbbbbb-0000-0000-0000-000000000003','meera','meera@acme.edu');

-- Offering, allocation, registration
INSERT INTO academics.course_offering (course_offering_id, course_version_id, term_id, section_id, department_id, enrolled_count, status)
VALUES ('ffffffff-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','88888888-8888-8888-8888-888888888888','22222222-2222-2222-2222-222222222222',2,'ACTIVE');

INSERT INTO academics.faculty_allocation (course_offering_id, faculty_id, role, match_score, match_rationale, approved_by)
VALUES ('ffffffff-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001','PRIMARY',92.5,'Taught this course 3 prior terms; PhD in algorithms','eeeeeeee-0000-0000-0000-000000000003');

INSERT INTO academics.student_registration (course_offering_id, student_id) VALUES
 ('ffffffff-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001'),
 ('ffffffff-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000002');

-- Attendance
INSERT INTO academics.class_session (class_session_id, course_offering_id, session_date, faculty_id, status)
VALUES ('ffffffff-0000-0000-0000-000000000011','ffffffff-0000-0000-0000-000000000001','2026-08-04','dddddddd-0000-0000-0000-000000000001','CONDUCTED');

INSERT INTO attendance.attendance_record (class_session_id, student_id, session_date, status) VALUES
 ('ffffffff-0000-0000-0000-000000000011','cccccccc-0000-0000-0000-000000000001','2026-08-04','PRESENT'),
 ('ffffffff-0000-0000-0000-000000000011','cccccccc-0000-0000-0000-000000000002','2026-08-04','ABSENT');

INSERT INTO attendance.attendance_summary (student_id, course_offering_id, term_id, as_of_date,
    classes_held, classes_attended, raw_pct, adjusted_pct, trend_slope, projected_end_pct, band, risk_level, computed_by_agent) VALUES
 ('cccccccc-0000-0000-0000-000000000001','ffffffff-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','2026-09-01',40,36,90.00,90.00,0.20,91.00,'GTE_75','NONE','A11_ATTENDANCE_ANALYSIS'),
 ('cccccccc-0000-0000-0000-000000000002','ffffffff-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','2026-09-01',40,28,70.00,70.00,-1.40,64.00,'B70_75','AT_RISK','A11_ATTENDANCE_ANALYSIS');

-- Assessment with question-level marks
INSERT INTO assessment.assessment_type (assessment_type_id, institution_id, code, name, category, default_max_marks)
VALUES ('ffffffff-0000-0000-0000-000000000021','11111111-1111-1111-1111-111111111111','MID1','Mid Term 1','INTERNAL',30);

INSERT INTO assessment.assessment (assessment_id, course_offering_id, assessment_type_id, name, sequence_no, max_marks, weightage, conducted_on, status)
VALUES ('ffffffff-0000-0000-0000-000000000031','ffffffff-0000-0000-0000-000000000001','ffffffff-0000-0000-0000-000000000021','Mid Term 1',1,30,50,'2026-09-10','EVALUATED');

INSERT INTO assessment.question_paper (question_paper_id, assessment_id, course_version_id, status, setter_faculty_id)
VALUES ('ffffffff-0000-0000-0000-000000000041','ffffffff-0000-0000-0000-000000000031','aaaaaaaa-0000-0000-0000-000000000001','USED','dddddddd-0000-0000-0000-000000000001');

INSERT INTO assessment.paper_question (paper_question_id, question_paper_id, question_no, question_text, marks, course_outcome_id, course_unit_id, bloom_level) VALUES
 ('ffffffff-0000-0000-0000-000000000051','ffffffff-0000-0000-0000-000000000041','1a','Implement a circular queue',15,'aaaaaaaa-0000-0000-0000-000000000201','aaaaaaaa-0000-0000-0000-000000000101',3),
 ('ffffffff-0000-0000-0000-000000000052','ffffffff-0000-0000-0000-000000000041','2a','Analyse the complexity of AVL rotation',15,'aaaaaaaa-0000-0000-0000-000000000202','aaaaaaaa-0000-0000-0000-000000000102',4);

INSERT INTO assessment.student_question_mark (paper_question_id, student_id, marks_obtained) VALUES
 ('ffffffff-0000-0000-0000-000000000051','cccccccc-0000-0000-0000-000000000001',13),
 ('ffffffff-0000-0000-0000-000000000051','cccccccc-0000-0000-0000-000000000002',8),
 ('ffffffff-0000-0000-0000-000000000052','cccccccc-0000-0000-0000-000000000001',12),
 ('ffffffff-0000-0000-0000-000000000052','cccccccc-0000-0000-0000-000000000002',5);

-- CO attainment computed from question marks (this is Agent 8's core query)
INSERT INTO outcomes.attainment_rubric (attainment_rubric_id, institution_id, name, version, threshold_pct, level_bands, effective_from)
VALUES ('ffffffff-0000-0000-0000-000000000061','11111111-1111-1111-1111-111111111111','Standard NBA Rubric','v1',60.00,
        '[{"min_pct":70,"level":3},{"min_pct":60,"level":2},{"min_pct":50,"level":1}]'::jsonb,'2025-07-01');

INSERT INTO outcomes.attainment_run (attainment_run_id, course_offering_id, attainment_rubric_id, run_by_agent, student_count, status)
VALUES ('ffffffff-0000-0000-0000-000000000071','ffffffff-0000-0000-0000-000000000001','ffffffff-0000-0000-0000-000000000061','A08_COURSE_OUTCOME',2,'APPROVED');

-- Compute direct attainment straight from question-level marks
INSERT INTO outcomes.co_attainment (attainment_run_id, course_outcome_id, students_evaluated,
       students_attaining, attaining_pct, direct_level, final_level, target_level, contributing_questions)
SELECT 'ffffffff-0000-0000-0000-000000000071'::uuid,
       pq.course_outcome_id,
       count(DISTINCT sqm.student_id),
       count(DISTINCT sqm.student_id) FILTER (WHERE sqm.marks_obtained >= 0.60 * pq.marks),
       round(100.0 * count(DISTINCT sqm.student_id) FILTER (WHERE sqm.marks_obtained >= 0.60 * pq.marks)
             / nullif(count(DISTINCT sqm.student_id),0), 2),
       CASE WHEN 100.0 * count(*) FILTER (WHERE sqm.marks_obtained >= 0.60*pq.marks)/count(*) >= 70 THEN 3
            WHEN 100.0 * count(*) FILTER (WHERE sqm.marks_obtained >= 0.60*pq.marks)/count(*) >= 60 THEN 2
            ELSE 1 END,
       CASE WHEN 100.0 * count(*) FILTER (WHERE sqm.marks_obtained >= 0.60*pq.marks)/count(*) >= 70 THEN 3
            WHEN 100.0 * count(*) FILTER (WHERE sqm.marks_obtained >= 0.60*pq.marks)/count(*) >= 60 THEN 2
            ELSE 1 END,
       2.00,
       jsonb_agg(DISTINCT pq.paper_question_id)
FROM assessment.paper_question pq
JOIN assessment.student_question_mark sqm ON sqm.paper_question_id = pq.paper_question_id
WHERE pq.question_paper_id = 'ffffffff-0000-0000-0000-000000000041'
GROUP BY pq.course_outcome_id;

INSERT INTO outcomes.po_attainment (programme_outcome_id, batch_id, term_id, contributing_co_count,
       weighted_level, target_level, contributing_runs, status)
SELECT 'aaaaaaaa-0000-0000-0000-000000000301'::uuid,
       '77777777-7777-7777-7777-777777777777'::uuid,
       '44444444-4444-4444-4444-444444444444'::uuid,
       count(*),
       round(sum(coa.final_level * cpm.strength) / sum(cpm.strength), 2),
       2.00,
       ARRAY['ffffffff-0000-0000-0000-000000000071'::uuid],
       'COMPUTED'
FROM outcomes.co_attainment coa
JOIN curriculum.co_po_map cpm ON cpm.course_outcome_id = coa.course_outcome_id
WHERE cpm.programme_outcome_id = 'aaaaaaaa-0000-0000-0000-000000000301';

-- Agent registry + a risk flag with the full loop
INSERT INTO agentops.agent (agent_id, code, agent_no, name, domain, agent_class, scope_statement,
       reasoning_policy, requires_human_approval, owner_user_id, status)
VALUES ('ffffffff-0000-0000-0000-000000000081','A11_ATTENDANCE_ANALYSIS',11,'Attendance Analysis Agent','ATTENDANCE',2,
        'Classifies attendance, projects end-of-term position, recommends intervention.','RECOMMEND',true,
        'eeeeeeee-0000-0000-0000-000000000003','ACTIVE');

INSERT INTO agentops.agent_run (agent_run_id, agent_id, agent_version, trigger_type, scope, status, finished_at)
VALUES ('ffffffff-0000-0000-0000-000000000091','ffffffff-0000-0000-0000-000000000081','1.0','SCHEDULED',
        '{"term":"ODD 2025-26","department":"CSE"}'::jsonb,'SUCCEEDED', now());

INSERT INTO agentops.risk_flag (agent_id, agent_run_id, subject_type, student_id, course_offering_id,
       flag_type, severity, baseline_value, observed_value, deviation_summary, contributing_signals,
       suggested_first_action, responder_user_id, respond_by)
VALUES ('ffffffff-0000-0000-0000-000000000081','ffffffff-0000-0000-0000-000000000091','STUDENT',
        'cccccccc-0000-0000-0000-000000000002','ffffffff-0000-0000-0000-000000000001',
        'ATTENDANCE_SHORTFALL','HIGH',88.0,70.0,
        'Attendance fell from 88 to 70 over four weeks; projected 64 percent at term end',
        '{"attendance_trend":-1.4,"mid1_marks_pct":43,"assignment_submissions":"1 of 3"}'::jsonb,
        'Mentor check-in this week; 6 classes needed to reach 75 percent',
        'eeeeeeee-0000-0000-0000-000000000003', now() + interval '3 days');
