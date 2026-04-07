import type { AuthRole } from "../../domains/auth/types";
import type { DashboardMode, TaskStatus } from "../../domains/task/types";
import type { ThemeId } from "../../domains/preferences/types";

export type UiLocale = "ko" | "en";
export type ProjectSourceLabelKey = "postgres" | "local-file" | "firestore" | "preview" | "memory" | "unknown";
export type UploadModeLabelKey = "supabase-storage" | "local-dev-storage" | "mock-storage" | "unknown";

export type UICatalog = {
  brand: {
    appName: string;
    appDescription: string;
    primaryNavAriaLabel: string;
  };
  nav: Record<DashboardMode, string>;
  sidebar: {
    projectNameAriaLabel: string;
    projectNamePlaceholder: string;
    previewCopy: string;
    workspaceCopy: string;
    projectMetadataValue: string;
    projectMetadataLoading: string;
    projectMetadataSyncing: string;
    previewNote: string;
    checkingSession: string;
    localAuthNote: string;
  };
  themes: {
    label: string;
    helper: string;
    saving: string;
    saveFailed: string;
    options: Record<ThemeId, { label: string; description: string }>;
  };
  login: {
    title: string;
    subtitle: string;
    stubNote: string;
    email: string;
    password: string;
  };
  workspace: {
    fallbackEyebrow: string;
    fallbackProjectName: string;
    headerCopy: string;
    calendarMonthPickerLabel: string;
    calendarMonthHeading: string;
    calendarPreviousMonth: string;
    calendarNextMonth: string;
    calendarToday: string;
    calendarMonthEmptyTitle: string;
    calendarMonthEmptyBody: string;
    dataUploadSummary: string;
    metadataSummary: string;
    localAuthNote: string;
    loading: string;
    noItemsTitle: string;
    noItemsBody: string;
    quickCreateEyebrow: string;
    quickCreateTitle: string;
    quickCreateBody: string;
    totalLabel: string;
    overdueLabel: string;
    dueDateMeta: string;
    fileCount: string;
    deletedDateMeta: string;
    deletedTasksTitle: string;
    deletedFilesTitle: string;
    deleteFilePermanentlyConfirm: string;
    deleteTaskPermanentlyConfirm: string;
    deleteSelectedConfirm: string;
    emptyTrashConfirm: string;
    trashItemTask: string;
    trashItemFile: string;
    selectedCount: string;
    taskDetailsTitle: string;
    downloadAvailable: string;
    exportTasks: string;
    exporting: string;
    privateStorage: string;
    detailPanelEmpty: string;
    dateInputPlaceholder: string;
    datePickerAria: string;
    parentTaskNumberPlaceholder: string;
    resizeFieldAria: string;
    headerFilterAria: string;
    hideIssueIdOverdueBadge: string;
    dailyFocusSummary: string;
    autoAfterCreate: string;
    autoValue: string;
    resetFilter: string;
    statusHistoryPlaceholder: string;
    linkedDocumentSummaryMulti: string;
    agendaMeta: string;
    filePreviewTitle: string;
    previewFileLabel: string;
    previewUnavailable: string;
    pinDetailPanel: string;
    unpinDetailPanel: string;
    expandDetailPanel: string;
    collapseDetailPanel: string;
    expandBoardColumn: string;
    collapseBoardColumn: string;
    showTaskMemo: string;
    hideTaskMemo: string;
    showTaskMemoCompact: string;
    hideTaskMemoCompact: string;
    dailyListViewModeAria: string;
    dailyListViewFull: string;
    dailyListViewPaged: string;
    dailyListPaginationAria: string;
    dailyListGoToPage: string;
    dailyListPageRange: string;
    pageStatus: string;
    weekdays: {
      mon: string;
      tue: string;
      wed: string;
      thu: string;
      fri: string;
      sat: string;
      sun: string;
    };
    weekdaysLong: {
      mon: string;
      tue: string;
      wed: string;
      thu: string;
      fri: string;
      sat: string;
      sun: string;
    };
    previewLoading: string;
  };
  fields: {
    actionId: string;
    dueDate: string;
    workType: string;
    coordinationScope: string;
    ownerDiscipline: string;
    requestedBy: string;
    relatedDisciplines: string;
    assignee: string;
    issueTitle: string;
    reviewedAt: string;
    updatedAt: string;
    locationRef: string;
    calendarLinked: string;
    issueDetailNote: string;
    status: string;
    completedAt: string;
    statusHistory: string;
    decision: string;
    linkedDocuments: string;
    parentActionId: string;
  };
  status: {
    labels: Record<TaskStatus, string>;
    descriptions: Record<TaskStatus, string>;
  };
  system: {
    yes: string;
    no: string;
    unknown: string;
    configured: string;
    missing: string;
    loading: string;
    syncing: string;
    dataLabel: string;
    uploadLabel: string;
    projectMetadataLabel: string;
    supabaseLabel: string;
    roles: Record<AuthRole, string>;
    projectSources: Record<ProjectSourceLabelKey, string>;
    uploadModes: Record<UploadModeLabelKey, string>;
  };
  empty: {
    nothingSelected: string;
    noDescription: string;
    uncategorized: string;
    unassigned: string;
    noTaskInState: string;
    noScheduledTasks: string;
    noScheduledTasksBody: string;
    noDeletedTasks: string;
    noDeletedFiles: string;
    noLinkedDocuments: string;
    addFilePrompt: string;
    moreFilesAvailable: string;
  };
  actions: {
    login: string;
    authNotConnected: string;
    signingIn: string;
    logout: string;
    hideForm: string;
    showForm: string;
    createTask: string;
    keepListVisible: string;
    back: string;
    next: string;
    expand: string;
    collapse: string;
    showDetails: string;
    hideDetails: string;
    cancel: string;
    confirm: string;
    save: string;
    saving: string;
    resetChanges: string;
    restore: string;
    deletePermanently: string;
    deleteSelected: string;
    emptyTrash: string;
    selectAll: string;
    clearSelection: string;
    moveToTrash: string;
    uploadFile: string;
    uploadNextVersion: string;
    open: string;
    download: string;
    remove: string;
  };
  errors: {
    loginFailed: string;
    previewMutationNotAllowed: string;
    loadTasksFailed: string;
    loadFilesFailed: string;
    loadDashboardFailed: string;
    exportTasksFailed: string;
    createTaskFailed: string;
    saveTaskFailed: string;
    updateTaskFailed: string;
    moveTaskToTrashFailed: string;
    restoreTaskFailed: string;
    uploadFileFailed: string;
    uploadNextVersionFailed: string;
    moveFileToTrashFailed: string;
    restoreFileFailed: string;
    deleteFileFailed: string;
    deleteTaskFailed: string;
    deleteSelectedFailed: string;
    emptyTrashFailed: string;
    invalidCredentials: string;
    authNotConfigured: string;
    unauthorized: string;
    forbidden: string;
    taskNotFound: string;
    fileNotFound: string;
    fileNotInTrash: string;
    taskNotInTrash: string;
    taskVersionRequired: string;
    taskVersionConflict: string;
    invalidParentTask: string;
    parentTaskNotFound: string;
    parentTaskNumberInvalid: string;
    taskStatusInvalid: string;
    taskCoordinationScopeInvalid: string;
    taskRequestedByInvalid: string;
    taskRelatedDisciplinesInvalid: string;
    taskLocationRefInvalid: string;
    projectNameRequired: string;
    taskIdRequired: string;
    fileRequired: string;
    fileTooLarge: string;
    fileTypeNotAllowed: string;
    supabaseEnvMissing: string;
    firebaseEnvMissing: string;
    cloudEnvMissing: string;
    backendModeInvalid: string;
    databaseUrlMissing: string;
    internalServerError: string;
  };
};

export const uiCopyCatalog = {
  ko: {
    brand: {
      appName: "아키텍트 스타트",
      appDescription: "협업 작업 관리 도구",
      primaryNavAriaLabel: "주요 탐색",
    },
    nav: {
      board: "보드",
      daily: "일일 목록",
      calendar: "캘린더",
      trash: "휴지통",
    },
    sidebar: {
      projectNameAriaLabel: "프로젝트명",
      projectNamePlaceholder: "프로젝트명을 입력하세요",
      previewCopy: "반응형 QA용 미리보기 모드입니다.",
      workspaceCopy: "보드, 일일 목록, 캘린더, 휴지통 화면에서 작업을 관리합니다.",
      projectMetadataValue: "프로젝트 정보: {{source}}",
      projectMetadataLoading: "프로젝트 정보를 불러오는 중...",
      projectMetadataSyncing: "프로젝트 정보를 동기화하는 중...",
      previewNote: "미리보기 모드는 데모 데이터를 사용하며 수정은 비활성화됩니다.",
      checkingSession: "세션 확인 중...",
      localAuthNote: "현재 로컬 플레이스홀더 사용자로 인증 중입니다. 이후 Supabase를 연결해 실제 로그인으로 전환할 수 있습니다.",
    },
    themes: {
      label: "테마",
      helper: "지금은 테마 전환 준비 단계라 선택을 바꿔도 화면은 동일하게 유지됩니다.",
      saving: "테마 저장 중...",
      saveFailed: "테마를 저장하지 못했습니다. 이전 선택으로 되돌렸습니다.",
      options: {
        classic: {
          label: "Classic",
          description: "현재 기본 토큰 세트입니다.",
        },
        "swiss-modern": {
          label: "Swiss Modern",
          description: "그리드 중심의 구조적 테마 슬롯입니다.",
        },
        productivity: {
          label: "Productivity",
          description: "업무형 SaaS 테마 슬롯입니다.",
        },
      },
    },
    login: {
      title: "로그인",
      subtitle: "실제 인증 연결이 준비되면 이 화면을 사용합니다. 그전까지는 앱이 로컬 플레이스홀더 모드로 동작합니다.",
      stubNote: "실제 로그인 연결이 아직 설정되지 않았습니다. 지금은 로컬 작업 공간을 그대로 사용할 수 있고, 이후에도 화면 흐름을 바꾸지 않고 Supabase 인증을 연결할 수 있습니다.",
      email: "이메일",
      password: "비밀번호",
    },
    workspace: {
      fallbackEyebrow: "작업 공간",
      fallbackProjectName: "프로젝트",
      headerCopy: "보드, 목록, 캘린더, 휴지통 화면을 오가도 작업 맥락이 유지됩니다.",
      calendarMonthPickerLabel: "연월 선택",
      calendarMonthHeading: "{{month}}",
      calendarPreviousMonth: "이전 달",
      calendarNextMonth: "다음 달",
      calendarToday: "오늘",
      calendarMonthEmptyTitle: "{{month}}에는 일정이 없습니다.",
      calendarMonthEmptyBody: "이전 달, 오늘, 다음 달 버튼이나 연월 선택기로 다른 달을 확인하세요.",
      dataUploadSummary: "데이터: {{data}} / 업로드: {{upload}}",
      metadataSummary: "프로젝트 정보: {{source}} / Supabase {{status}}",
      localAuthNote: "인증은 현재 로컬 플레이스홀더 모드로 동작 중입니다. 이후에도 화면 흐름을 바꾸지 않고 실제 로그인을 연결할 수 있습니다.",
      loading: "작업 공간을 불러오는 중...",
      noItemsTitle: "아직 항목이 없습니다.",
      noItemsBody: "작업을 추가해 추적을 시작하세요.",
      quickCreateEyebrow: "빠른 생성",
      quickCreateTitle: "작업 추가",
      quickCreateBody: "입력 폼은 요청한 필드 순서를 유지하고 첨부 문서는 생성 후 업로드 흐름으로 처리합니다.",
      totalLabel: "전체",
      overdueLabel: "기한 지남",
      dueDateMeta: "마감 {{date}}",
      fileCount: "{{count}}개 파일",
      deletedDateMeta: "삭제일 {{date}}",
      deletedTasksTitle: "삭제된 작업",
      deletedFilesTitle: "삭제된 파일",
      deleteFilePermanentlyConfirm: "{{name}} {{version}} 파일을 완전 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
      deleteTaskPermanentlyConfirm: "{{name}} 작업과 연결된 첨부파일을 완전 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
      deleteSelectedConfirm: "선택한 항목을 완전 삭제하시겠습니까? 작업 {{taskCount}}개, 파일 {{fileCount}}개가 삭제되며 이 작업은 되돌릴 수 없습니다.",
      emptyTrashConfirm: "휴지통의 모든 항목을 완전 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
      trashItemTask: "작업",
      trashItemFile: "파일",
      selectedCount: "{{count}}개 선택",
      taskDetailsTitle: "작업 상세",
      downloadAvailable: "다운로드 가능",
      exportTasks: "엑셀로 내보내기",
      exporting: "내보내는 중...",
      privateStorage: "비공개 저장소",
      detailPanelEmpty: "목록에서 작업을 선택해 상세 정보를 수정하고 첨부 문서를 관리하세요.",
      dateInputPlaceholder: "YYYY-MM-DD",
      datePickerAria: "{{label}} 달력 열기",
      parentTaskNumberPlaceholder: "#12 또는 12",
      resizeFieldAria: "{{field}} 너비 조절",
      headerFilterAria: "{{field}} 필터: {{label}}",
      hideIssueIdOverdueBadge: "이슈 ID 지연 표시 숨기기",
      dailyFocusSummary: "집중 영역 · 실행 순서를 바꾸기 전에 우선 처리군을 먼저 확인합니다.",
      autoAfterCreate: "생성 후 자동 지정",
      autoValue: "자동",
      resetFilter: "초기화",
      statusHistoryPlaceholder: "첫 저장 후 자동으로 기록됩니다.",
      linkedDocumentSummaryMulti: "{{name}} 외 {{count}}개",
      agendaMeta: "{{status}} / {{assignee}}",
      filePreviewTitle: "문서 미리보기",
      previewFileLabel: "미리보기 파일",
      previewUnavailable: "이 작업에 패널 미리보기를 지원하는 파일이 없습니다.",
      pinDetailPanel: "패널 고정",
      unpinDetailPanel: "패널 고정 해제",
      expandDetailPanel: "패널 펼치기",
      collapseDetailPanel: "패널 최소화",
      expandBoardColumn: "컬럼 펼치기",
      collapseBoardColumn: "컬럼 접기",
      showTaskMemo: "메모 보기",
      hideTaskMemo: "메모 숨기기",
      showTaskMemoCompact: "메모",
      hideTaskMemoCompact: "접기",
      dailyListViewModeAria: "일일목록 보기 전환",
      dailyListViewFull: "전체",
      dailyListViewPaged: "50개씩",
      dailyListPaginationAria: "일일목록 페이지 이동",
      dailyListGoToPage: "{{page}}페이지로 이동",
      dailyListPageRange: "{{from}}-{{to}} / {{total}}",
      pageStatus: "{{current}} / {{total}}",
      weekdays: {
        mon: "월",
        tue: "화",
        wed: "수",
        thu: "목",
        fri: "금",
        sat: "토",
        sun: "일",
      },
      weekdaysLong: {
        mon: "월요일",
        tue: "화요일",
        wed: "수요일",
        thu: "목요일",
        fri: "금요일",
        sat: "토요일",
        sun: "일요일",
      },
      previewLoading: "미리보기를 불러오는 중...",
    },
    fields: {
      actionId: "이슈 ID",
      dueDate: "마감일",
      workType: "작업 유형",
      coordinationScope: "협업 범위",
      ownerDiscipline: "책임 분야",
      requestedBy: "요청자",
      relatedDisciplines: "관련 분야",
      assignee: "담당자",
      issueTitle: "이슈 제목",
      reviewedAt: "검토일",
      updatedAt: "수정 일시",
      locationRef: "위치 참조",
      calendarLinked: "캘린더 연동",
      issueDetailNote: "상세 메모",
      status: "상태",
      completedAt: "완료 일시",
      statusHistory: "상태 변경 이력",
      decision: "결정 사항",
      linkedDocuments: "첨부 문서",
      parentActionId: "상위 이슈 ID",
    },
    status: {
      labels: {
        new: "신규",
        in_review: "검토중",
        in_discussion: "협의중",
        blocked: "보류",
        done: "완료",
      },
      descriptions: {
        new: "새로 등록되어 검토를 기다리는 작업입니다.",
        in_review: "검토가 진행 중이거나 바로 검토할 작업입니다.",
        in_discussion: "협의와 조율이 진행 중인 작업입니다.",
        blocked: "선행 조건이나 외부 입력을 기다리는 작업입니다.",
        done: "완료되어 참고용으로 보관되는 작업입니다.",
      },
    },
    system: {
      yes: "예",
      no: "아니오",
      unknown: "알 수 없음",
      configured: "연결됨",
      missing: "미연결",
      loading: "불러오는 중...",
      syncing: "동기화 중...",
      dataLabel: "데이터",
      uploadLabel: "업로드",
      projectMetadataLabel: "프로젝트 정보",
      supabaseLabel: "Supabase",
      roles: {
        admin: "관리자",
        member: "구성원",
      },
      projectSources: {
        postgres: "PostgreSQL",
        "local-file": "로컬 파일",
        firestore: "Firestore",
        preview: "미리보기",
        memory: "메모리",
        unknown: "알 수 없음",
      },
      uploadModes: {
        "supabase-storage": "Supabase Storage",
        "local-dev-storage": "로컬 저장소",
        "mock-storage": "모의 저장소",
        unknown: "알 수 없음",
      },
    },
    empty: {
      nothingSelected: "선택된 작업 없음",
      noDescription: "설명 없음",
      uncategorized: "미분류",
      unassigned: "미배정",
      noTaskInState: "이 상태의 작업이 없습니다.",
      noScheduledTasks: "예정된 작업이 없습니다.",
      noScheduledTasksBody: "캘린더 보기를 채우려면 마감일을 추가하세요.",
      noDeletedTasks: "휴지통이 비어 있습니다.",
      noDeletedFiles: "휴지통이 비어 있습니다.",
      noLinkedDocuments: "이 작업에 첨부 문서가 없습니다.",
      addFilePrompt: "파일을 등록하세요",
      moreFilesAvailable: "추가 파일 등록 가능",
    },
    actions: {
      login: "로그인",
      authNotConnected: "인증 연결 안 됨",
      signingIn: "로그인 중...",
      logout: "로그아웃",
      hideForm: "입력 폼 숨기기",
      showForm: "입력 폼 보기",
      createTask: "작업 생성",
      keepListVisible: "목록 유지",
      back: "이전",
      next: "다음",
      expand: "펼치기",
      collapse: "접기",
      showDetails: "메모 보기",
      hideDetails: "메모 숨기기",
      cancel: "취소",
      confirm: "확인",
      save: "저장",
      saving: "저장 중...",
      resetChanges: "변경 초기화",
      restore: "복원",
      deletePermanently: "완전 삭제",
      deleteSelected: "선택 삭제",
      emptyTrash: "휴지통 전체 삭제",
      selectAll: "전체 선택",
      clearSelection: "선택 해제",
      moveToTrash: "휴지통으로 이동",
      uploadFile: "파일 업로드",
      uploadNextVersion: "새 버전 업로드",
      open: "열기",
      download: "다운로드",
      remove: "휴지통으로 이동",
    },
    errors: {
      loginFailed: "로그인에 실패했습니다.",
      previewMutationNotAllowed: "미리보기 모드에서는 수정할 수 없습니다.",
      loadTasksFailed: "작업을 불러오지 못했습니다.",
      loadFilesFailed: "파일을 불러오지 못했습니다.",
      loadDashboardFailed: "대시보드 데이터를 불러오지 못했습니다.",
      exportTasksFailed: "엑셀 내보내기에 실패했습니다.",
      createTaskFailed: "작업을 생성하지 못했습니다.",
      saveTaskFailed: "작업을 저장하지 못했습니다.",
      updateTaskFailed: "작업을 업데이트하지 못했습니다.",
      moveTaskToTrashFailed: "작업을 휴지통으로 이동하지 못했습니다.",
      restoreTaskFailed: "작업을 복원하지 못했습니다.",
      uploadFileFailed: "파일을 업로드하지 못했습니다.",
      uploadNextVersionFailed: "새 파일 버전을 업로드하지 못했습니다.",
      moveFileToTrashFailed: "파일을 휴지통으로 이동하지 못했습니다.",
      restoreFileFailed: "파일을 복원하지 못했습니다.",
      deleteFileFailed: "파일을 완전 삭제하지 못했습니다.",
      deleteTaskFailed: "작업을 완전 삭제하지 못했습니다.",
      deleteSelectedFailed: "선택한 항목을 완전 삭제하지 못했습니다.",
      emptyTrashFailed: "휴지통을 비우지 못했습니다.",
      invalidCredentials: "이메일 또는 비밀번호가 올바르지 않습니다.",
      authNotConfigured: "인증 연결이 아직 설정되지 않았습니다.",
      unauthorized: "로그인이 필요합니다.",
      forbidden: "권한이 없습니다.",
      taskNotFound: "작업을 찾을 수 없습니다.",
      fileNotFound: "파일을 찾을 수 없습니다.",
      fileNotInTrash: "휴지통에 있는 파일만 완전 삭제할 수 있습니다.",
      taskNotInTrash: "휴지통에 있는 작업만 완전 삭제할 수 있습니다.",
      taskVersionRequired: "버전 정보가 필요합니다.",
      taskVersionConflict: "다른 사용자가 먼저 수정했습니다. 최신 데이터를 불러온 뒤 다시 시도하세요.",
      invalidParentTask: "올바르지 않은 상위 작업입니다.",
      parentTaskNotFound: "상위 작업을 찾을 수 없습니다.",
      parentTaskNumberInvalid: "상위 이슈 ID 또는 번호 형식이 올바르지 않습니다.",
      taskStatusInvalid: "상태 값이 올바르지 않습니다.",
      taskCoordinationScopeInvalid: "협업범위 값이 올바르지 않습니다.",
      taskRequestedByInvalid: "요청자 값이 올바르지 않습니다.",
      taskRelatedDisciplinesInvalid: "관련분야 값이 올바르지 않습니다.",
      taskLocationRefInvalid: "위치참조 값이 올바르지 않습니다.",
      projectNameRequired: "프로젝트명을 입력하세요.",
      taskIdRequired: "작업 ID가 필요합니다.",
      fileRequired: "파일을 선택하세요.",
      fileTooLarge: "업로드 가능한 파일 크기를 초과했습니다.",
      fileTypeNotAllowed: "허용되지 않은 파일 형식입니다.",
      supabaseEnvMissing: "Supabase 설정이 완전하지 않습니다.",
      firebaseEnvMissing: "Firestore configuration is incomplete.",
      cloudEnvMissing: "Cloud backend configuration is incomplete.",
      backendModeInvalid: "APP_BACKEND_MODE is invalid.",
      databaseUrlMissing: "데이터베이스 설정이 완전하지 않습니다.",
      internalServerError: "예기치 않은 서버 오류가 발생했습니다.",
    },
  },
  en: {
    brand: {
      appName: "Architect Start",
      appDescription: "Collaborative work management tool",
      primaryNavAriaLabel: "Primary",
    },
    nav: {
      board: "Board",
      daily: "Daily List",
      calendar: "Calendar",
      trash: "Trash",
    },
    sidebar: {
      projectNameAriaLabel: "Project name",
      projectNamePlaceholder: "Enter a project name",
      previewCopy: "Preview mode for responsive QA.",
      workspaceCopy: "Task tracking workspace for board, daily, calendar, and archive views.",
      projectMetadataValue: "Project metadata: {{source}}",
      projectMetadataLoading: "Loading project metadata...",
      projectMetadataSyncing: "Syncing project metadata...",
      previewNote: "Preview mode uses demo data and disables mutations.",
      checkingSession: "Checking session...",
      localAuthNote: "Authentication is currently using a local placeholder user. Connect Supabase later to enable real sign-in.",
    },
    themes: {
      label: "Theme",
      helper: "This phase only prepares theme switching, so the visible UI stays the same for every option.",
      saving: "Saving theme...",
      saveFailed: "Could not save the theme. Reverted to the previous selection.",
      options: {
        classic: {
          label: "Classic",
          description: "Current default token set.",
        },
        "swiss-modern": {
          label: "Swiss Modern",
          description: "Structured grid-first theme slot.",
        },
        productivity: {
          label: "Productivity",
          description: "Productivity SaaS theme slot.",
        },
      },
    },
    login: {
      title: "Login",
      subtitle: "Use this page when real authentication is connected. Until then, the app runs in local placeholder mode.",
      stubNote: "Real sign-in is not connected yet. You can keep using the workspace locally, and wire Supabase auth later without changing the screen flow.",
      email: "Email",
      password: "Password",
    },
    workspace: {
      fallbackEyebrow: "Workspace",
      fallbackProjectName: "Project",
      headerCopy: "Switch between board, list, calendar, and archive views without losing context.",
      calendarMonthPickerLabel: "Month",
      calendarMonthHeading: "{{month}}",
      calendarPreviousMonth: "Previous month",
      calendarNextMonth: "Next month",
      calendarToday: "Today",
      calendarMonthEmptyTitle: "No tasks scheduled for {{month}}.",
      calendarMonthEmptyBody: "Use the previous, today, next, or month picker controls to browse a different month.",
      dataUploadSummary: "Data: {{data}} / Upload: {{upload}}",
      metadataSummary: "Project metadata: {{source}} / Supabase {{status}}",
      localAuthNote: "Authentication is running in local placeholder mode. Real sign-in can be connected later without changing this screen flow.",
      loading: "Loading workspace...",
      noItemsTitle: "No items yet.",
      noItemsBody: "Add a task to start tracking work.",
      quickCreateEyebrow: "Quick Create",
      quickCreateTitle: "Add a task",
      quickCreateBody: "The form follows your requested field order and keeps linked_documents as a post-create file flow.",
      totalLabel: "Total",
      overdueLabel: "Overdue",
      dueDateMeta: "Due {{date}}",
      fileCount: "{{count}} files",
      deletedDateMeta: "Deleted {{date}}",
      deletedTasksTitle: "Deleted tasks",
      deletedFilesTitle: "Deleted files",
      deleteFilePermanentlyConfirm: "Delete {{name}} {{version}} permanently? This action cannot be undone.",
      deleteTaskPermanentlyConfirm: "Delete {{name}} and its attached files permanently? This action cannot be undone.",
      deleteSelectedConfirm: "Delete the selected items permanently? This will remove {{taskCount}} tasks and {{fileCount}} files, and it cannot be undone.",
      emptyTrashConfirm: "Delete every item in the trash permanently? This action cannot be undone.",
      trashItemTask: "Task",
      trashItemFile: "File",
      selectedCount: "{{count}} selected",
      taskDetailsTitle: "Task details",
      downloadAvailable: "Download available",
      exportTasks: "Export to Excel",
      exporting: "Exporting...",
      privateStorage: "Private storage",
      detailPanelEmpty: "Select a task from the list to edit its details and manage linked_documents.",
      dateInputPlaceholder: "YYYY-MM-DD",
      datePickerAria: "{{label}} calendar",
      parentTaskNumberPlaceholder: "#12 or 12",
      resizeFieldAria: "Resize {{field}}",
      headerFilterAria: "{{field}} filter: {{label}}",
      hideIssueIdOverdueBadge: "Hide issue ID overdue badges",
      dailyFocusSummary: "Focus strip · Review the priority group before you reorder execution.",
      autoAfterCreate: "Auto after create",
      autoValue: "Auto",
      resetFilter: "Reset",
      statusHistoryPlaceholder: "Tracked automatically after the first save.",
      linkedDocumentSummaryMulti: "{{name}} +{{count}} more",
      agendaMeta: "{{status}} / {{assignee}}",
      filePreviewTitle: "Document preview",
      previewFileLabel: "Preview file",
      previewUnavailable: "No files on this task support inline preview in the detail panel.",
      pinDetailPanel: "Pin panel",
      unpinDetailPanel: "Unpin panel",
      expandDetailPanel: "Expand panel",
      collapseDetailPanel: "Collapse panel",
      expandBoardColumn: "Expand column",
      collapseBoardColumn: "Collapse column",
      showTaskMemo: "Show memo",
      hideTaskMemo: "Hide memo",
      showTaskMemoCompact: "Memo",
      hideTaskMemoCompact: "Hide",
      dailyListViewModeAria: "Switch daily list view",
      dailyListViewFull: "All",
      dailyListViewPaged: "50 per page",
      dailyListPaginationAria: "Daily list pagination",
      dailyListGoToPage: "Go to page {{page}}",
      dailyListPageRange: "{{from}}-{{to}} / {{total}}",
      pageStatus: "{{current}} / {{total}}",
      weekdays: {
        mon: "Mon",
        tue: "Tue",
        wed: "Wed",
        thu: "Thu",
        fri: "Fri",
        sat: "Sat",
        sun: "Sun",
      },
      weekdaysLong: {
        mon: "Monday",
        tue: "Tuesday",
        wed: "Wednesday",
        thu: "Thursday",
        fri: "Friday",
        sat: "Saturday",
        sun: "Sunday",
      },
      previewLoading: "Loading preview...",
    },
    fields: {
      actionId: "Issue ID",
      dueDate: "Due Date",
      workType: "Work Type",
      coordinationScope: "Coordination Scope",
      ownerDiscipline: "Owner Discipline",
      requestedBy: "Requested By",
      relatedDisciplines: "Related Disciplines",
      assignee: "Assignee",
      issueTitle: "Issue Title",
      reviewedAt: "Reviewed At",
      updatedAt: "Updated At",
      locationRef: "Location Ref",
      calendarLinked: "Calendar Linked",
      issueDetailNote: "Issue Detail Note",
      status: "Status",
      completedAt: "Completed At",
      statusHistory: "Status History",
      decision: "Decision",
      linkedDocuments: "Linked Documents",
      parentActionId: "Parent Issue ID",
    },
    status: {
      labels: {
        new: "New",
        in_review: "In review",
        in_discussion: "In discussion",
        blocked: "Blocked",
        done: "Done",
      },
      descriptions: {
        new: "Newly created tasks waiting for review.",
        in_review: "Tasks under review or ready to review next.",
        in_discussion: "Work that is actively being discussed and coordinated.",
        blocked: "Waiting on a blocker or external input.",
        done: "Finished work kept for reference.",
      },
    },
    system: {
      yes: "Yes",
      no: "No",
      unknown: "Unknown",
      configured: "configured",
      missing: "missing",
      loading: "Loading...",
      syncing: "Syncing...",
      dataLabel: "Data",
      uploadLabel: "Upload",
      projectMetadataLabel: "Project metadata",
      supabaseLabel: "Supabase",
      roles: {
        admin: "Admin",
        member: "Member",
      },
      projectSources: {
        postgres: "PostgreSQL",
        "local-file": "Local file",
        firestore: "Firestore",
        preview: "Preview",
        memory: "Memory",
        unknown: "Unknown",
      },
      uploadModes: {
        "supabase-storage": "Supabase Storage",
        "local-dev-storage": "Local storage",
        "mock-storage": "Mock storage",
        unknown: "Unknown",
      },
    },
    empty: {
      nothingSelected: "Nothing selected",
      noDescription: "No description",
      uncategorized: "Uncategorized",
      unassigned: "Unassigned",
      noTaskInState: "No tasks in this state.",
      noScheduledTasks: "No scheduled tasks.",
      noScheduledTasksBody: "Add due dates to populate the agenda view.",
      noDeletedTasks: "Trash is empty.",
      noDeletedFiles: "Trash is empty.",
      noLinkedDocuments: "No linked documents attached to this task.",
      addFilePrompt: "Add a file",
      moreFilesAvailable: "More files can be attached",
    },
    actions: {
      login: "Sign in",
      authNotConnected: "Auth not connected",
      signingIn: "Signing in...",
      logout: "Log out",
      hideForm: "Hide form",
      showForm: "Show form",
      createTask: "Create task",
      keepListVisible: "Keep list visible",
      back: "Back",
      next: "Next",
      expand: "Expand",
      collapse: "Collapse",
      showDetails: "Show note",
      hideDetails: "Hide note",
      cancel: "Cancel",
      confirm: "Confirm",
      save: "Save",
      saving: "Saving...",
      resetChanges: "Reset changes",
      restore: "Restore",
      deletePermanently: "Delete permanently",
      deleteSelected: "Delete selected",
      emptyTrash: "Empty trash",
      selectAll: "Select all",
      clearSelection: "Clear selection",
      moveToTrash: "Move to trash",
      uploadFile: "Upload file",
      uploadNextVersion: "Upload next version",
      open: "Open",
      download: "Download",
      remove: "Remove",
    },
    errors: {
      loginFailed: "Login failed.",
      previewMutationNotAllowed: "Preview mode does not allow mutations.",
      loadTasksFailed: "Failed to load tasks.",
      loadFilesFailed: "Failed to load files.",
      loadDashboardFailed: "Failed to load dashboard data.",
      exportTasksFailed: "Failed to export tasks.",
      createTaskFailed: "Failed to create the task.",
      saveTaskFailed: "Failed to save the task.",
      updateTaskFailed: "Failed to update the task.",
      moveTaskToTrashFailed: "Failed to move the task to trash.",
      restoreTaskFailed: "Failed to restore the task.",
      uploadFileFailed: "Failed to upload the file.",
      uploadNextVersionFailed: "Failed to upload the next file version.",
      moveFileToTrashFailed: "Failed to move the file to trash.",
      restoreFileFailed: "Failed to restore the file.",
      deleteFileFailed: "Failed to delete the file permanently.",
      deleteTaskFailed: "Failed to delete the task permanently.",
      deleteSelectedFailed: "Failed to delete the selected items permanently.",
      emptyTrashFailed: "Failed to empty the trash.",
      invalidCredentials: "Invalid email or password.",
      authNotConfigured: "Authentication provider is not connected yet.",
      unauthorized: "Login is required.",
      forbidden: "You do not have permission.",
      taskNotFound: "Task not found.",
      fileNotFound: "File not found.",
      fileNotInTrash: "Only trashed files can be deleted permanently.",
      taskNotInTrash: "Only trashed tasks can be deleted permanently.",
      taskVersionRequired: "Version is required.",
      taskVersionConflict: "Another user updated this task first. Reload the latest data and try again.",
      invalidParentTask: "Invalid parent task.",
      parentTaskNotFound: "Parent task not found.",
      parentTaskNumberInvalid: "Parent issue ID or numeric reference format is invalid.",
      taskStatusInvalid: "Status is invalid.",
      taskCoordinationScopeInvalid: "Coordination scope is invalid.",
      taskRequestedByInvalid: "Requested by is invalid.",
      taskRelatedDisciplinesInvalid: "Related disciplines are invalid.",
      taskLocationRefInvalid: "Location reference is invalid.",
      projectNameRequired: "Project name is required.",
      taskIdRequired: "Task ID is required.",
      fileRequired: "File is required.",
      fileTooLarge: "The file exceeds the allowed upload size.",
      fileTypeNotAllowed: "The file type is not allowed.",
      supabaseEnvMissing: "Supabase configuration is incomplete.",
      firebaseEnvMissing: "Firestore configuration is incomplete.",
      cloudEnvMissing: "Cloud backend configuration is incomplete.",
      backendModeInvalid: "APP_BACKEND_MODE is invalid.",
      databaseUrlMissing: "Database configuration is incomplete.",
      internalServerError: "Unexpected server error.",
    },
  },
} satisfies Record<UiLocale, UICatalog>;
