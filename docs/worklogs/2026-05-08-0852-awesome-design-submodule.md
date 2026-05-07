Req: 각 폴더의 Git 상태를 커밋 가능한 상태로 정리한다.
Diff: `awesome-design-md`를 외부 design reference repo submodule로 등록하고 `.gitmodules`를 추가했다.
Why: `awesome-design-md`는 내부 `.git`을 가진 독립 repo라 부모 repo에 파일 묶음으로 섞지 않고 submodule 포인터로 추적해야 한다.
Verify/Time: 2026-05-08 08:52 KST. `git diff --cached --submodule`, `git diff --cached --check` 확인.
