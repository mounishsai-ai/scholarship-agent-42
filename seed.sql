-- =====================================================================
-- seed.sql : demo data for the Scholarship Agent (Agent 42).
-- Self-contained: creates its own institution, calendar, programme and
-- students, so it does NOT depend on 99_smoke_test.sql.
-- Re-runnable: every insert is ON CONFLICT DO NOTHING on the primary key.
--
-- Built around three demo beats:
--   Beat 1  Priya  - eligible for schemes nobody told her about.
--   Beat 2  Arjun  - about to LOSE a renewal because attendance fell below 75%.
--   Beat 3  Fatima - being chased for fees a sanctioned scholarship already covers
--                    (finance.reminder_dispatch.suppressed COMMENT: this is the
--                     most common cause of avoidable distress in fee follow-up).
-- =====================================================================
BEGIN;

-- ---------- Foundation ----------
INSERT INTO core.institution (institution_id, code, name, type) VALUES
 ('a4200000-0000-0000-0000-000000000001','VIGNAN','Vignan University','DEEMED')
ON CONFLICT (institution_id) DO NOTHING;

INSERT INTO core.department (department_id, institution_id, code, name) VALUES
 ('a4200000-0000-0000-0000-000000000010','a4200000-0000-0000-0000-000000000001','CSE','Computer Science and Engineering')
ON CONFLICT (department_id) DO NOTHING;

INSERT INTO core.academic_year (academic_year_id, institution_id, label, start_date, end_date, is_current) VALUES
 ('a4200000-0000-0000-0000-000000000020','a4200000-0000-0000-0000-000000000001','2025-26','2025-07-01','2026-06-30',true)
ON CONFLICT (academic_year_id) DO NOTHING;

INSERT INTO core.term (term_id, academic_year_id, term_no, label, parity, start_date, end_date, status) VALUES
 ('a4200000-0000-0000-0000-000000000021','a4200000-0000-0000-0000-000000000020',1,'ODD 2025-26','ODD','2025-07-15','2025-12-15','ACTIVE')
ON CONFLICT (term_id) DO NOTHING;

-- ---------- Curriculum ----------
INSERT INTO curriculum.programme (programme_id, institution_id, department_id, code, name, level, degree, duration_years, total_terms, sanctioned_intake) VALUES
 ('a4200000-0000-0000-0000-000000000030','a4200000-0000-0000-0000-000000000001','a4200000-0000-0000-0000-000000000010','BTCSE','B.Tech Computer Science and Engineering','UG','B.Tech',4,8,180)
ON CONFLICT (programme_id) DO NOTHING;

INSERT INTO curriculum.regulation (regulation_id, institution_id, code, name, effective_from_admission_year, status) VALUES
 ('a4200000-0000-0000-0000-000000000031','a4200000-0000-0000-0000-000000000001','R23','Regulation 2023',2023,'ACTIVE')
ON CONFLICT (regulation_id) DO NOTHING;

INSERT INTO curriculum.batch (batch_id, programme_id, regulation_id, admission_year, label) VALUES
 ('a4200000-0000-0000-0000-000000000032','a4200000-0000-0000-0000-000000000030','a4200000-0000-0000-0000-000000000031',2023,'2023-27 CSE')
ON CONFLICT (batch_id) DO NOTHING;

INSERT INTO curriculum.section (section_id, batch_id, code, year_of_study, strength) VALUES
 ('a4200000-0000-0000-0000-000000000033','a4200000-0000-0000-0000-000000000032','A',3,60)
ON CONFLICT (section_id) DO NOTHING;

-- ---------- People (persons) ----------
-- social_category is used here LAWFULLY as a statutory scholarship rule,
-- never as a predictive-model feature (see COMMENT in 02_people_identity.sql).
INSERT INTO people.person (person_id, institution_id, full_name, gender, social_category, primary_email) VALUES
 ('a4200000-0000-0000-0000-000000000101','a4200000-0000-0000-0000-000000000001','Priya Sharma','F','SC','priya@vignan.edu'),
 ('a4200000-0000-0000-0000-000000000102','a4200000-0000-0000-0000-000000000001','Arjun Rao','M','OBC','arjun@vignan.edu'),
 ('a4200000-0000-0000-0000-000000000103','a4200000-0000-0000-0000-000000000001','Fatima Khan','F','EWS','fatima@vignan.edu'),
 ('a4200000-0000-0000-0000-000000000104','a4200000-0000-0000-0000-000000000001','Karthik Nair','M','GENERAL','karthik@vignan.edu'),
 ('a4200000-0000-0000-0000-000000000105','a4200000-0000-0000-0000-000000000001','Sneha Patil','F','ST','sneha@vignan.edu'),
 ('a4200000-0000-0000-0000-000000000106','a4200000-0000-0000-0000-000000000001','Rahul Das','M','OBC','rahul@vignan.edu'),
 ('a4200000-0000-0000-0000-000000000107','a4200000-0000-0000-0000-000000000001','Ananya Iyer','F','GENERAL','ananya@vignan.edu'),
 ('a4200000-0000-0000-0000-000000000108','a4200000-0000-0000-0000-000000000001','Mohammed Ali','M','SC','mohammed@vignan.edu'),
 ('a4200000-0000-0000-0000-0000000001ff','a4200000-0000-0000-0000-000000000001','Lakshmi Devi (Scholarship Officer)','F',NULL,'scholarship@vignan.edu')
ON CONFLICT (person_id) DO NOTHING;

-- ---------- Students ----------
INSERT INTO people.student (student_id, person_id, admission_no, roll_no, batch_id, admission_date, current_section_id, current_year_of_study) VALUES
 ('a4200000-0000-0000-0000-000000000201','a4200000-0000-0000-0000-000000000101','ADM2023001','23CSE001','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-000000000202','a4200000-0000-0000-0000-000000000102','ADM2023002','23CSE002','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-000000000203','a4200000-0000-0000-0000-000000000103','ADM2023003','23CSE003','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-000000000204','a4200000-0000-0000-0000-000000000104','ADM2023004','23CSE004','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-000000000205','a4200000-0000-0000-0000-000000000105','ADM2023005','23CSE005','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-000000000206','a4200000-0000-0000-0000-000000000106','ADM2023006','23CSE006','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-000000000207','a4200000-0000-0000-0000-000000000107','ADM2023007','23CSE007','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-000000000208','a4200000-0000-0000-0000-000000000108','ADM2023008','23CSE008','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3)
ON CONFLICT (student_id) DO NOTHING;

-- ---------- Guardians (annual_income drives income-ceiling rules) ----------
INSERT INTO people.guardian (guardian_id, student_id, name, relation, annual_income, is_primary_contact) VALUES
 ('a4200000-0000-0000-0000-000000000301','a4200000-0000-0000-0000-000000000201','Ramesh Sharma','FATHER',180000,true),
 ('a4200000-0000-0000-0000-000000000302','a4200000-0000-0000-0000-000000000202','Suresh Rao','FATHER',190000,true),
 ('a4200000-0000-0000-0000-000000000303','a4200000-0000-0000-0000-000000000203','Imran Khan','FATHER',150000,true),
 ('a4200000-0000-0000-0000-000000000304','a4200000-0000-0000-0000-000000000204','Vijay Nair','FATHER',900000,true),
 ('a4200000-0000-0000-0000-000000000305','a4200000-0000-0000-0000-000000000205','Ganesh Patil','FATHER',120000,true),
 ('a4200000-0000-0000-0000-000000000306','a4200000-0000-0000-0000-000000000206','Prakash Das','FATHER',240000,true),
 ('a4200000-0000-0000-0000-000000000307','a4200000-0000-0000-0000-000000000207','Mahesh Iyer','FATHER',300000,true),
 ('a4200000-0000-0000-0000-000000000308','a4200000-0000-0000-0000-000000000208','Yousuf Ali','FATHER',200000,true)
ON CONFLICT (guardian_id) DO NOTHING;

-- ---------- Term results (cgpa, backlogs) ----------
INSERT INTO assessment.term_result (student_id, term_id, credits_registered, credits_earned, sgpa, cgpa, backlog_count, promotion_status, published_on) VALUES
 ('a4200000-0000-0000-0000-000000000201','a4200000-0000-0000-0000-000000000021',22,22,8.20,8.20,0,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-000000000202','a4200000-0000-0000-0000-000000000021',22,22,7.50,7.50,0,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-000000000203','a4200000-0000-0000-0000-000000000021',22,22,8.80,8.80,0,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-000000000204','a4200000-0000-0000-0000-000000000021',22,20,6.90,6.90,1,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-000000000205','a4200000-0000-0000-0000-000000000021',22,22,7.90,7.90,0,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-000000000206','a4200000-0000-0000-0000-000000000021',22,18,6.40,6.40,2,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-000000000207','a4200000-0000-0000-0000-000000000021',22,22,9.10,9.10,0,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-000000000208','a4200000-0000-0000-0000-000000000021',22,22,7.10,7.10,0,'PROMOTED','2025-07-01')
ON CONFLICT (student_id, term_id) DO NOTHING;

-- ---------- Attendance (term aggregate: course_offering_id = NULL) ----------
INSERT INTO attendance.attendance_summary (student_id, course_offering_id, term_id, as_of_date, classes_held, classes_attended, raw_pct, adjusted_pct, band, risk_level, computed_by_agent) VALUES
 ('a4200000-0000-0000-0000-000000000201',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,88,88.00,88.00,'GTE_75','NONE','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-000000000202',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,68,68.00,68.00,'B65_70','AT_RISK','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-000000000203',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,92,92.00,92.00,'GTE_75','NONE','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-000000000204',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,80,80.00,80.00,'GTE_75','NONE','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-000000000205',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,76,76.00,76.00,'GTE_75','NONE','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-000000000206',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,72,72.00,72.00,'B70_75','WATCH','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-000000000207',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,95,95.00,95.00,'GTE_75','NONE','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-000000000208',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,74,74.00,74.00,'B70_75','WATCH','A11_ATTENDANCE_ANALYSIS')
ON CONFLICT (student_id, course_offering_id, term_id, as_of_date) DO NOTHING;

-- ---------- Identity: scholarship officer service user + reference roles ----------
INSERT INTO identity.app_user (user_id, person_id, username, email, is_service_account) VALUES
 ('a4200000-0000-0000-0000-0000000000ff','a4200000-0000-0000-0000-0000000001ff','scholarship_officer','scholarship@vignan.edu',false)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO identity.role (role_id, code, name, is_system) VALUES
 ('a4200000-0000-0000-0000-000000000f01','ACCOUNTS','Accounts / Scholarship Officer',false),
 ('a4200000-0000-0000-0000-000000000f02','HOD','Head of Department',false),
 ('a4200000-0000-0000-0000-000000000f03','STUDENT','Student',true)
ON CONFLICT (role_id) DO NOTHING;

-- ---------- Agent registry: register Agent 42 ----------
INSERT INTO agentops.agent (agent_id, code, agent_no, name, domain, agent_class, scope_statement, out_of_scope,
       reasoning_policy, requires_human_approval, escalation_rule, owner_user_id, version, status, deployed_on) VALUES
 ('a4200000-0000-0000-0000-0000000000a4','A42_SCHOLARSHIP',42,'Scholarship Agent','FINANCE',3,
  'Matches every student against every scholarship scheme, tracks applications through disbursement, monitors renewal conditions, and reconciles disbursements against the fee ledger.',
  'Does not decide loan products or approve sanctions; every notification and action needs a human approval.',
  'ACT_WITH_APPROVAL',true,
  'Escalate to the Scholarship Officer when a renewal is at LIKELY_LOSS or a disbursement mismatch exceeds the fee outstanding.',
  'a4200000-0000-0000-0000-0000000000ff','1.0','ACTIVE','2026-09-11')
ON CONFLICT (agent_id) DO NOTHING;

-- ---------- Scholarship schemes (eligibility_criteria = machine-evaluable rules) ----------
INSERT INTO finance.scholarship_scheme (scholarship_scheme_id, code, name, provider_type, provider_name,
       benefit_type, benefit_amount, eligibility_criteria, required_documents,
       application_opens, application_closes, renewal_required, renewal_criteria, academic_year_id, is_active) VALUES
 ('a4200000-0000-0000-0000-000000000501','PMS_SCST','Post-Matric Scholarship for SC/ST Students','CENTRAL','Ministry of Social Justice & Empowerment',
  'FULL_TUITION',50000,
  '{"all":[{"field":"social_category","op":"in","value":["SC","ST"]},{"field":"annual_income","op":"lte","value":250000}]}'::jsonb,
  ARRAY['Income Certificate','Caste Certificate','Aadhaar Card','Bank Passbook','Previous Marksheet'],
  '2025-08-01','2025-10-31',true,
  '{"all":[{"field":"attendance_pct","op":"gte","value":75}]}'::jsonb,
  'a4200000-0000-0000-0000-000000000020',true),

 ('a4200000-0000-0000-0000-000000000502','MCM_STATE','State Merit-cum-Means Scholarship','STATE','State Government',
  'FIXED_AMOUNT',50000,
  '{"all":[{"field":"annual_income","op":"lte","value":200000},{"field":"cgpa","op":"gte","value":7.0}]}'::jsonb,
  ARRAY['Income Certificate','Bonafide Certificate','Previous Marksheet','Bank Passbook'],
  '2025-08-15','2025-11-15',true,
  '{"all":[{"field":"attendance_pct","op":"gte","value":75},{"field":"cgpa","op":"gte","value":6.5}]}'::jsonb,
  'a4200000-0000-0000-0000-000000000020',true),

 ('a4200000-0000-0000-0000-000000000503','EWS_INST','EWS Tuition Fee Concession','INSTITUTIONAL','Vignan University',
  'PARTIAL',40000,
  '{"all":[{"field":"social_category","op":"in","value":["EWS"]},{"field":"annual_income","op":"lte","value":800000}]}'::jsonb,
  ARRAY['EWS Certificate','Income Certificate','Aadhaar Card'],
  '2025-07-01','2025-12-31',false,
  NULL,
  'a4200000-0000-0000-0000-000000000020',true),

 ('a4200000-0000-0000-0000-000000000504','PRAGATI_AICTE','Pragati Scholarship for Girl Students','CENTRAL','AICTE',
  'FIXED_AMOUNT',50000,
  '{"all":[{"field":"gender","op":"eq","value":"F"},{"field":"annual_income","op":"lte","value":800000}]}'::jsonb,
  ARRAY['Income Certificate','Aadhaar Card','Admission Proof','Bank Passbook','Family Declaration'],
  '2025-09-01','2025-11-30',true,
  '{"all":[{"field":"attendance_pct","op":"gte","value":75}]}'::jsonb,
  'a4200000-0000-0000-0000-000000000020',true)
ON CONFLICT (scholarship_scheme_id) DO NOTHING;

-- ---------- Payment (Fatima's scholarship disbursement, beat 3) ----------
INSERT INTO finance.payment (payment_id, student_id, amount, payment_mode, channel, transaction_ref, paid_on, received_on, receipt_no, status, reconciled_at) VALUES
 ('a4200000-0000-0000-0000-000000000901','a4200000-0000-0000-0000-000000000203',40000,'SCHOLARSHIP','DBT','EWS-2025-0003','2025-09-05','2025-09-05','SCHRCPT0003','RECONCILED','2025-09-06')
ON CONFLICT (payment_id) DO NOTHING;

-- ---------- Applications (populate the tracker across every status) ----------
INSERT INTO finance.scholarship_application (scholarship_application_id, scholarship_scheme_id, student_id, academic_year_id,
       external_application_no, applied_on, status, rejection_reason, sanctioned_amount, disbursed_amount, disbursed_on, payment_id) VALUES
 -- Arjun: SANCTIONED merit-cum-means, now at renewal risk (attendance 68%)
 ('a4200000-0000-0000-0000-000000000601','a4200000-0000-0000-0000-000000000502','a4200000-0000-0000-0000-000000000202','a4200000-0000-0000-0000-000000000020',
  'MCM2025A0002','2025-09-01','SANCTIONED',NULL,50000,NULL,NULL,NULL),
 -- Fatima: DISBURSED EWS concession, linked to the payment above (beat 3)
 ('a4200000-0000-0000-0000-000000000602','a4200000-0000-0000-0000-000000000503','a4200000-0000-0000-0000-000000000203','a4200000-0000-0000-0000-000000000020',
  'EWS2025A0003','2025-07-10','DISBURSED',NULL,40000,40000,'2025-09-05','a4200000-0000-0000-0000-000000000901'),
 -- Sneha: SUBMITTED, awaiting institutional verification
 ('a4200000-0000-0000-0000-000000000603','a4200000-0000-0000-0000-000000000501','a4200000-0000-0000-0000-000000000205','a4200000-0000-0000-0000-000000000020',
  'PMS2025A0005','2025-09-20','SUBMITTED',NULL,NULL,NULL,NULL,NULL),
 -- Mohammed: INSTITUTION_VERIFIED, forwarded to the portal
 ('a4200000-0000-0000-0000-000000000604','a4200000-0000-0000-0000-000000000501','a4200000-0000-0000-0000-000000000208','a4200000-0000-0000-0000-000000000020',
  'PMS2025A0008','2025-09-18','INSTITUTION_VERIFIED',NULL,NULL,NULL,NULL,NULL),
 -- Rahul: REJECTED for a procedural reason (income over ceiling)
 ('a4200000-0000-0000-0000-000000000605','a4200000-0000-0000-0000-000000000502','a4200000-0000-0000-0000-000000000206','a4200000-0000-0000-0000-000000000020',
  'MCM2025A0006','2025-09-10','REJECTED','Family income exceeds the scheme ceiling of Rs 2,00,000',NULL,NULL,NULL,NULL)
ON CONFLICT (scholarship_application_id) DO NOTHING;

-- ---------- Fee demand + reminder for Fatima (beat 3) ----------
INSERT INTO finance.fee_demand (fee_demand_id, student_id, academic_year_id, gross_amount, concession_amount,
       scholarship_expected, net_payable, paid_amount, due_date, status) VALUES
 ('a4200000-0000-0000-0000-000000000701','a4200000-0000-0000-0000-000000000203','a4200000-0000-0000-0000-000000000020',
  40000,0,40000,40000,0,'2025-10-15','OPEN')
ON CONFLICT (fee_demand_id) DO NOTHING;

-- A reminder is being sent to Fatima even though her scholarship is DISBURSED.
-- The reconcile action should flag this for suppression.
INSERT INTO finance.reminder_dispatch (reminder_dispatch_id, student_id, fee_demand_id, segment, escalation_level,
       channel, message_ref, suppressed, sent_at) VALUES
 ('a4200000-0000-0000-0000-000000000801','a4200000-0000-0000-0000-000000000203','a4200000-0000-0000-0000-000000000701',
  'AWAITING_SCHOLARSHIP',2,'SMS','FEE-REM-0003',false,'2025-10-01 09:00+05:30')
ON CONFLICT (reminder_dispatch_id) DO NOTHING;

-- =====================================================================
-- Additional students 23CSE009 - 23CSE020 (scale the cohort to 20).
-- Varied category / income / CGPA / attendance to fill the matrix.
-- =====================================================================
INSERT INTO people.person (person_id, institution_id, full_name, gender, social_category, primary_email) VALUES
 ('a4200000-0000-0000-0000-000000000109','a4200000-0000-0000-0000-000000000001','Divya Menon','F','ST','divya@vignan.edu'),
 ('a4200000-0000-0000-0000-00000000010a','a4200000-0000-0000-0000-000000000001','Vikram Singh','M','GENERAL','vikram@vignan.edu'),
 ('a4200000-0000-0000-0000-00000000010b','a4200000-0000-0000-0000-000000000001','Aisha Begum','F','OBC','aisha@vignan.edu'),
 ('a4200000-0000-0000-0000-00000000010c','a4200000-0000-0000-0000-000000000001','Suresh Kumar','M','SC','sureshk@vignan.edu'),
 ('a4200000-0000-0000-0000-00000000010d','a4200000-0000-0000-0000-000000000001','Neha Gupta','F','EWS','neha@vignan.edu'),
 ('a4200000-0000-0000-0000-00000000010e','a4200000-0000-0000-0000-000000000001','Rohit Sharma','M','OBC','rohit@vignan.edu'),
 ('a4200000-0000-0000-0000-00000000010f','a4200000-0000-0000-0000-000000000001','Kavya Reddy','F','GENERAL','kavya@vignan.edu'),
 ('a4200000-0000-0000-0000-000000000110','a4200000-0000-0000-0000-000000000001','Arun Prasad','M','ST','arun@vignan.edu'),
 ('a4200000-0000-0000-0000-000000000111','a4200000-0000-0000-0000-000000000001','Meena Kumari','F','SC','meena@vignan.edu'),
 ('a4200000-0000-0000-0000-000000000112','a4200000-0000-0000-0000-000000000001','Sanjay Verma','M','GENERAL','sanjay@vignan.edu'),
 ('a4200000-0000-0000-0000-000000000113','a4200000-0000-0000-0000-000000000001','Pooja Nair','F','OBC','pooja@vignan.edu'),
 ('a4200000-0000-0000-0000-000000000114','a4200000-0000-0000-0000-000000000001','Farhan Sheikh','M','EWS','farhan@vignan.edu')
ON CONFLICT (person_id) DO NOTHING;

INSERT INTO people.student (student_id, person_id, admission_no, roll_no, batch_id, admission_date, current_section_id, current_year_of_study) VALUES
 ('a4200000-0000-0000-0000-000000000209','a4200000-0000-0000-0000-000000000109','ADM2023009','23CSE009','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-00000000020a','a4200000-0000-0000-0000-00000000010a','ADM2023010','23CSE010','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-00000000020b','a4200000-0000-0000-0000-00000000010b','ADM2023011','23CSE011','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-00000000020c','a4200000-0000-0000-0000-00000000010c','ADM2023012','23CSE012','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-00000000020d','a4200000-0000-0000-0000-00000000010d','ADM2023013','23CSE013','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-00000000020e','a4200000-0000-0000-0000-00000000010e','ADM2023014','23CSE014','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-00000000020f','a4200000-0000-0000-0000-00000000010f','ADM2023015','23CSE015','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-000000000210','a4200000-0000-0000-0000-000000000110','ADM2023016','23CSE016','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-000000000211','a4200000-0000-0000-0000-000000000111','ADM2023017','23CSE017','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-000000000212','a4200000-0000-0000-0000-000000000112','ADM2023018','23CSE018','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-000000000213','a4200000-0000-0000-0000-000000000113','ADM2023019','23CSE019','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3),
 ('a4200000-0000-0000-0000-000000000214','a4200000-0000-0000-0000-000000000114','ADM2023020','23CSE020','a4200000-0000-0000-0000-000000000032','2023-08-01','a4200000-0000-0000-0000-000000000033',3)
ON CONFLICT (student_id) DO NOTHING;

INSERT INTO people.guardian (guardian_id, student_id, name, relation, annual_income, is_primary_contact) VALUES
 ('a4200000-0000-0000-0000-000000000309','a4200000-0000-0000-0000-000000000209','Rajan Menon','FATHER',130000,true),
 ('a4200000-0000-0000-0000-00000000030a','a4200000-0000-0000-0000-00000000020a','Harpal Singh','FATHER',1200000,true),
 ('a4200000-0000-0000-0000-00000000030b','a4200000-0000-0000-0000-00000000020b','Karim Begum','FATHER',195000,true),
 ('a4200000-0000-0000-0000-00000000030c','a4200000-0000-0000-0000-00000000020c','Ravi Kumar','FATHER',210000,true),
 ('a4200000-0000-0000-0000-00000000030d','a4200000-0000-0000-0000-00000000020d','Anil Gupta','FATHER',400000,true),
 ('a4200000-0000-0000-0000-00000000030e','a4200000-0000-0000-0000-00000000020e','Mahesh Sharma','FATHER',180000,true),
 ('a4200000-0000-0000-0000-00000000030f','a4200000-0000-0000-0000-00000000020f','Naresh Reddy','FATHER',250000,true),
 ('a4200000-0000-0000-0000-000000000310','a4200000-0000-0000-0000-000000000210','Gopal Prasad','FATHER',90000,true),
 ('a4200000-0000-0000-0000-000000000311','a4200000-0000-0000-0000-000000000211','Ramesh Kumari','FATHER',160000,true),
 ('a4200000-0000-0000-0000-000000000312','a4200000-0000-0000-0000-000000000212','Dinesh Verma','FATHER',700000,true),
 ('a4200000-0000-0000-0000-000000000313','a4200000-0000-0000-0000-000000000213','Sunil Nair','FATHER',220000,true),
 ('a4200000-0000-0000-0000-000000000314','a4200000-0000-0000-0000-000000000214','Iqbal Sheikh','FATHER',300000,true)
ON CONFLICT (guardian_id) DO NOTHING;

INSERT INTO assessment.term_result (student_id, term_id, credits_registered, credits_earned, sgpa, cgpa, backlog_count, promotion_status, published_on) VALUES
 ('a4200000-0000-0000-0000-000000000209','a4200000-0000-0000-0000-000000000021',22,22,8.00,8.00,0,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-00000000020a','a4200000-0000-0000-0000-000000000021',22,22,7.80,7.80,0,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-00000000020b','a4200000-0000-0000-0000-000000000021',22,22,7.20,7.20,0,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-00000000020c','a4200000-0000-0000-0000-000000000021',22,20,6.80,6.80,1,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-00000000020d','a4200000-0000-0000-0000-000000000021',22,22,8.50,8.50,0,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-00000000020e','a4200000-0000-0000-0000-000000000021',22,22,7.60,7.60,0,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-00000000020f','a4200000-0000-0000-0000-000000000021',22,22,9.00,9.00,0,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-000000000210','a4200000-0000-0000-0000-000000000021',22,18,6.20,6.20,2,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-000000000211','a4200000-0000-0000-0000-000000000021',22,22,7.90,7.90,0,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-000000000212','a4200000-0000-0000-0000-000000000021',22,22,8.10,8.10,0,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-000000000213','a4200000-0000-0000-0000-000000000021',22,22,7.40,7.40,0,'PROMOTED','2025-07-01'),
 ('a4200000-0000-0000-0000-000000000214','a4200000-0000-0000-0000-000000000021',22,22,8.30,8.30,0,'PROMOTED','2025-07-01')
ON CONFLICT (student_id, term_id) DO NOTHING;

INSERT INTO attendance.attendance_summary (student_id, course_offering_id, term_id, as_of_date, classes_held, classes_attended, raw_pct, adjusted_pct, band, risk_level, computed_by_agent) VALUES
 ('a4200000-0000-0000-0000-000000000209',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,82,82.00,82.00,'GTE_75','NONE','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-00000000020a',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,90,90.00,90.00,'GTE_75','NONE','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-00000000020b',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,70,70.00,70.00,'B70_75','WATCH','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-00000000020c',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,78,78.00,78.00,'GTE_75','NONE','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-00000000020d',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,85,85.00,85.00,'GTE_75','NONE','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-00000000020e',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,74,74.00,74.00,'B70_75','WATCH','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-00000000020f',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,96,96.00,96.00,'GTE_75','NONE','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-000000000210',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,65,65.00,65.00,'B65_70','AT_RISK','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-000000000211',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,79,79.00,79.00,'GTE_75','NONE','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-000000000212',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,88,88.00,88.00,'GTE_75','NONE','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-000000000213',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,73,73.00,73.00,'B70_75','WATCH','A11_ATTENDANCE_ANALYSIS'),
 ('a4200000-0000-0000-0000-000000000214',NULL,'a4200000-0000-0000-0000-000000000021','2025-11-01',100,91,91.00,91.00,'GTE_75','NONE','A11_ATTENDANCE_ANALYSIS')
ON CONFLICT (student_id, course_offering_id, term_id, as_of_date) DO NOTHING;

-- Extra applications: one healthy renewal, one more at-risk (Arun, 65%), one submitted.
INSERT INTO finance.scholarship_application (scholarship_application_id, scholarship_scheme_id, student_id, academic_year_id,
       external_application_no, applied_on, status, rejection_reason, sanctioned_amount, disbursed_amount, disbursed_on, payment_id) VALUES
 ('a4200000-0000-0000-0000-000000000606','a4200000-0000-0000-0000-000000000501','a4200000-0000-0000-0000-000000000209','a4200000-0000-0000-0000-000000000020',
  'PMS2025A0009','2025-09-02','SANCTIONED',NULL,50000,NULL,NULL,NULL),
 ('a4200000-0000-0000-0000-000000000607','a4200000-0000-0000-0000-000000000501','a4200000-0000-0000-0000-000000000210','a4200000-0000-0000-0000-000000000020',
  'PMS2025A0016','2025-09-03','SANCTIONED',NULL,50000,NULL,NULL,NULL),
 ('a4200000-0000-0000-0000-000000000608','a4200000-0000-0000-0000-000000000502','a4200000-0000-0000-0000-000000000211','a4200000-0000-0000-0000-000000000020',
  'MCM2025A0017','2025-09-22','SUBMITTED',NULL,NULL,NULL,NULL,NULL)
ON CONFLICT (scholarship_application_id) DO NOTHING;

COMMIT;

-- Sanity check: all eight demo students should resolve in the profile view.
SELECT roll_no, full_name, cgpa, attendance_pct, fee_outstanding
FROM people.v_student_profile
WHERE roll_no LIKE '23CSE%'
ORDER BY roll_no;
