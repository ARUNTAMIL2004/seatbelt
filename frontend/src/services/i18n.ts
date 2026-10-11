export type Language = 'en' | 'ta';

const en = {
    // Top Bar & Navigation
    app_title: "Seatbelt Production & Traceability System",
    plant_name: "Plant 02 • Singaperumalkovil Assembly Line",
    station_online: "PLC GATEWAY ONLINE",
    operator: "Operator",
    role: "Role",
    switch_role: "Switch Role",
    production_user: "Production User",
    quality_user: "Quality User",
    supervisor: "Supervisor",
    admin: "Admin",
    scan_qr_nav: "Production Station",
    dashboard_nav: "Dashboard",
    quality_hub_nav: "Quality Review",
    search_nav: "Traceability Search",
    reports_nav: "Reports & Export",
    admin_nav: "Admin & PLC Config",

    // Action Buttons
    scan_qr: "SCAN QR CODE",
    enter_missing_data: "ENTER MISSING DATA",
    rework: "REWORK",
    run_again: "RUN AGAIN",
    view_history: "VIEW RUN HISTORY",
    quality_review: "QUALITY REVIEW",
    save: "SAVE DATA",
    cancel: "CANCEL",
    confirm_rework: "CONFIRM REWORK",
    generate_qr: "GENERATE NEW QR",
    print_certificate: "GENEALOGY CERTIFICATE",
    test_plc: "TEST PLC LINK",
    export_csv: "EXPORT CSV",

    // Statuses
    NOT_STARTED: "Not Started",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
    DATA_MISSING: "Data Missing",
    REWORK_REQUIRED: "Rework Required",
    READY_FOR_RERUN: "Ready for Re-run",
    QUALITY_PENDING: "Quality Pending",
    QUALITY_APPROVED: "Quality Approved",
    QUALITY_REJECTED: "Quality Rejected",
    BLOCKED: "Locked / Waiting",

    // Run Types
    MACHINE_RUN: "Machine Run (PLC)",
    REWORK_RUN: "Rework Run",
    MANUAL_DATA_ENTRY: "Manual Data Entry",
    QUALITY_APPROVAL: "Quality Approval",

    // Rework Reasons
    rework_reason_part_not_run: "Part not run",
    rework_reason_machine_error: "Machine error",
    rework_reason_sensor_error: "Sensor error",
    rework_reason_param_error: "Parameter error",
    rework_reason_assembly_issue: "Assembly issue",
    rework_reason_quality_issue: "Quality issue",
    rework_reason_other: "Other",

    // Missing Data Reasons
    missing_reason_lan_drop: "Part physically completed, machine PLC data not recorded.",
    missing_reason_sensor_offline: "Part processed during sensor offline maintenance.",
    missing_reason_manual_line: "Part processed on calibrated backup fixture.",

    // Dashboard Cards
    total_production: "Total Production",
    completed_units: "Completed",
    in_progress_units: "In Progress",
    rework_units: "Rework Required",
    missing_data_units: "Missing Data Entries",
    quality_pending_units: "Quality Pending",
    rejected_units: "Rejected Units",
    first_pass_yield: "First Pass Yield",
    throughput_title: "Machine-wise Production Throughput",
    pareto_title: "Rework Reasons Pareto Distribution",
    missing_stats_title: "Missing Data Frequency by Machine",
    recent_activity_title: "Live Shop Floor Activity Feed",

    // Machine Sequence
    m1_name: "Webbing Cutting & Heat-Sealing",
    m2_name: "Retractor Spool Assembly",
    m3_name: "Pyrotechnic Pretensioner",
    m4_name: "Buckle & Latch Plate Assembly",
    m5_name: "Load Limiter & Torsion Bar",
    m6_name: "Final Tensile & Optical Inspection",

    // Detail Panel
    machine_details: "Machine Process Details",
    current_run: "CURRENT RUN",
    run_history: "RUN HISTORY",
    run_number: "Run #",
    parameters_recorded: "Recorded Machine Parameters",
    tolerances: "Tolerances",
    nominal: "Nominal",
    result: "Result",
    data_source: "Data Source",
    started_at: "Started",
    completed_at: "Completed",
    no_runs_yet: "No runs recorded for this station yet.",
    unlocked_msg: "Station unlocked and ready for processing.",
    locked_msg: "Locked. Previous machine process must be completed first.",

    // Notifications
    scan_success: "QR Code scanned successfully!",
    rework_initiated: "Rework initiated. Previous run archived to history.",
    missing_data_saved: "Missing data successfully recorded! Next station unlocked.",
    rerun_success: "Station re-run completed successfully with PASS result!",
    quality_approved_msg: "Record approved by Quality Assurance.",
    quality_rejected_msg: "Record rejected by Quality Assurance.",

    // Authentication
    login_title: "Sign in to continue",
    login_subtitle: "Use your employee ID and password",
    employee_id: "Employee ID",
    password: "Password",
    sign_in: "SIGN IN",
    signing_in: "Signing in...",
    sign_out: "Sign out",
    session_expired: "Your session has expired. Please sign in again.",
    idle_signed_out: "You were signed out after a period of inactivity.",
    change_password: "Change password",
    current_password: "Current password",
    new_password: "New password",
    password_changed: "Password updated.",

    // Generic
    loading: "Loading...",
    retry: "Retry",
    no_data: "No data to show.",
    run_station: "RUN STATION",
    flag_missing: "FLAG DATA MISSING",
    view_only: "View only - your role cannot perform production actions.",
    toggle_theme: "Toggle light/dark theme",
    toggle_sound: "Mute / unmute audio",
    change_language: "Change language",
    certificate_draft: "DRAFT - NOT CERTIFIED",
    previous: "Previous",
    next: "Next",
    search_placeholder: "Search QR, serial, model or batch",
    all_statuses: "All statuses",
    all_stations: "All stations"
};

const ta: Record<keyof typeof en, string> = {
    // Top Bar & Navigation
    app_title: "சீட்பெல்ட் உற்பத்தி & தடம் அறியும் அமைப்பு",
    plant_name: "தொழிற்சாலை 02 • சிங்கபெருமாள்கோவில் அசெம்பிளி லைன்",
    station_online: "PLC இணைப்பு ஆன்லைன்",
    operator: "ஆபரேட்டர்",
    role: "பங்கு",
    switch_role: "பங்கு மாற்று",
    production_user: "உற்பத்தி பயனர்",
    quality_user: "தரக் கட்டுப்பாட்டு பயனர்",
    supervisor: "மேற்பார்வையாளர்",
    admin: "நிர்வாகி",
    scan_qr_nav: "உற்பத்தி நிலையம்",
    dashboard_nav: "டாஷ்போர்டு",
    quality_hub_nav: "தர ஆய்வு",
    search_nav: "தேடல்",
    reports_nav: "அறிக்கைகள்",
    admin_nav: "PLC கட்டமைப்பு",

    // Action Buttons
    scan_qr: "QR ஸ்கேன் செய்",
    enter_missing_data: "விடுபட்ட தரவை உள்ளிடு",
    rework: "மறுவேலை (REWORK)",
    run_again: "மீண்டும் இயக்கு",
    view_history: "இயக்க வரலாற்றைக் காண்க",
    quality_review: "தர ஆய்வு செய்",
    save: "தரவைச் சேமி",
    cancel: "ரத்து செய்",
    confirm_rework: "மறுவேலையை உறுதிசெய்",
    generate_qr: "புதிய QR உருவாக்கு",
    print_certificate: "சான்றிதழ் அச்சிடு",
    test_plc: "PLC சோதனை செய்",
    export_csv: "CSV ஏற்றுமதி",

    // Statuses
    NOT_STARTED: "தொடங்கப்படவில்லை",
    IN_PROGRESS: "செயல்பாட்டில் உள்ளது",
    COMPLETED: "முழுமையடைந்தது",
    DATA_MISSING: "தரவு விடுபட்டுள்ளது",
    REWORK_REQUIRED: "மறுவேலை தேவை",
    READY_FOR_RERUN: "மீண்டும் இயக்க தயார்",
    QUALITY_PENDING: "தர ஆய்வு நிலுவையில்",
    QUALITY_APPROVED: "தர ஒப்புதல் அளிக்கப்பட்டது",
    QUALITY_REJECTED: "நிராகரிக்கப்பட்டது",
    BLOCKED: "பூட்டப்பட்டது / காத்திருக்கிறது",

    // Run Types
    MACHINE_RUN: "இயந்திர ஓட்டம் (PLC)",
    REWORK_RUN: "மறுவேலை ஓட்டம்",
    MANUAL_DATA_ENTRY: "கைமுறை தரவு பதிவு",
    QUALITY_APPROVAL: "தரக் கட்டுப்பாட்டு ஒப்புதல்",

    // Rework Reasons
    rework_reason_part_not_run: "பகுதி இயங்கவில்லை",
    rework_reason_machine_error: "இயந்திரப் பிழை",
    rework_reason_sensor_error: "சென்சார் பிழை",
    rework_reason_param_error: "அளவுரு வரம்புப் பிழை",
    rework_reason_assembly_issue: "அசெம்பிளி குறைபாடு",
    rework_reason_quality_issue: "தரக் குறைபாடு",
    rework_reason_other: "பிற காரணங்கள்",

    // Missing Data Reasons
    missing_reason_lan_drop: "பாகம் இயங்கியது, ஆனால் இயந்திரத் தரவு பதிவாகவில்லை.",
    missing_reason_sensor_offline: "சென்சார் பராமரிப்பின் போது பாகம் செயலாக்கப்பட்டது.",
    missing_reason_manual_line: "காப்பு சாதனத்தில் செயலாக்கப்பட்டது.",

    // Dashboard Cards
    total_production: "மொத்த உற்பத்தி",
    completed_units: "முடிவடைந்தவை",
    in_progress_units: "செயல்பாட்டில் உள்ளவை",
    rework_units: "மறுவேலை தேவைப்படுபவை",
    missing_data_units: "விடுபட்ட தரவு பதிவுகள்",
    quality_pending_units: "தர ஆய்வுக்கு காத்திருப்பவை",
    rejected_units: "நிராகரிக்கப்பட்டவை",
    first_pass_yield: "முதல் முறை சரியான உற்பத்தி %",
    throughput_title: "இயந்திர வாரியான உற்பத்தி திறன்",
    pareto_title: "மறுவேலை காரணங்கள் பகுப்பாய்வு",
    missing_stats_title: "விடுபட்ட தரவு புள்ளிவிவரங்கள்",
    recent_activity_title: "நேரடி தொழிற்சாலை நிகழ்வுகள்",

    // Machine Sequence
    m1_name: "நாடா வெட்டுதல் & சீலிங் நிலையம்",
    m2_name: "ரீட்ராக்டர் ஸ்பூல் அசெம்பிளி",
    m3_name: "ப்ரீடென்ஷனர் பொருத்துதல்",
    m4_name: "பக்கிள் & லாட்ச் பிளேட் அசெம்பிளி",
    m5_name: "லோட் லிமிட்டர் & டார்ஷன் பார்",
    m6_name: "இறுதி இழுவிசை & பார்வை ஆய்வு",

    // Detail Panel
    machine_details: "இயந்திர செயல்முறை விவரங்கள்",
    current_run: "தற்போதைய இயக்கம்",
    run_history: "இயக்க வரலாறு",
    run_number: "இயக்க எண் #",
    parameters_recorded: "பதிவான அளவுருக்கள்",
    tolerances: "அனுமதிக்கப்பட்ட வரம்புகள்",
    nominal: "சராசரி மதிப்பு",
    result: "முடிவு",
    data_source: "தரவு ஆதாரம்",
    started_at: "தொடங்கிய நேரம்",
    completed_at: "முடிந்த நேரம்",
    no_runs_yet: "இந்த நிலையத்தில் இன்னும் இயக்கங்கள் பதிவாகவில்லை.",
    unlocked_msg: "நிலையம் திறக்கப்பட்டு தயார் நிலையில் உள்ளது.",
    locked_msg: "பூட்டப்பட்டது. முந்தைய நிலையத்தை முதலில் முடிக்க வேண்டும்.",

    // Notifications
    scan_success: "QR குறியீடு வெற்றிகரமாக ஸ்கேன் செய்யப்பட்டது!",
    rework_initiated: "மறுவேலை தொடங்கப்பட்டது. முந்தைய பதிவு வரலாற்றில் வைக்கப்பட்டது.",
    missing_data_saved: "விடுபட்ட தரவு பதிவு செய்யப்பட்டது! அடுத்த நிலையம் திறக்கப்பட்டது.",
    rerun_success: "மறுஇயக்கம் வெற்றிகரமாக நிறைவுபெற்றது!",
    quality_approved_msg: "தரக் கட்டுப்பாட்டு ஒப்புதல் அளிக்கப்பட்டது.",
    quality_rejected_msg: "தரக் கட்டுப்பாட்டினால் நிராகரிக்கப்பட்டது.",

    // Authentication
    login_title: "தொடர உள்நுழையவும்",
    login_subtitle: "உங்கள் ஊழியர் எண் மற்றும் கடவுச்சொல்லை உள்ளிடவும்",
    employee_id: "ஊழியர் எண்",
    password: "கடவுச்சொல்",
    sign_in: "உள்நுழை",
    signing_in: "உள்நுழைகிறது...",
    sign_out: "வெளியேறு",
    session_expired: "உங்கள் அமர்வு முடிந்துவிட்டது. மீண்டும் உள்நுழையவும்.",
    idle_signed_out: "நீண்ட நேரம் செயல்படாததால் வெளியேற்றப்பட்டீர்கள்.",
    change_password: "கடவுச்சொல்லை மாற்று",
    current_password: "தற்போதைய கடவுச்சொல்",
    new_password: "புதிய கடவுச்சொல்",
    password_changed: "கடவுச்சொல் மாற்றப்பட்டது.",

    // Generic
    loading: "ஏற்றுகிறது...",
    retry: "மீண்டும் முயற்சி",
    no_data: "காண்பிக்க தரவு இல்லை.",
    run_station: "நிலையத்தை இயக்கு",
    flag_missing: "தரவு விடுபட்டதாகக் குறி",
    view_only: "பார்வை மட்டும் - உங்கள் பங்கிற்கு உற்பத்தி செயல்கள் அனுமதிக்கப்படவில்லை.",
    toggle_theme: "ஒளி/இருள் தோற்றம் மாற்று",
    toggle_sound: "ஒலியை முடக்கு / இயக்கு",
    change_language: "மொழி மாற்று",
    certificate_draft: "வரைவு - சான்றளிக்கப்படவில்லை",
    previous: "முந்தையது",
    next: "அடுத்தது",
    search_placeholder: "QR, வரிசை எண், மாடல் அல்லது தொகுதி தேடு",
    all_statuses: "அனைத்து நிலைகள்",
    all_stations: "அனைத்து நிலையங்கள்"
};

export type Translations = Record<keyof typeof en, string>;
export const translations: { en: Translations; ta: Translations } = { en, ta };
export type TranslationKey = keyof Translations;
