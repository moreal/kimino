/** Local reading controls deliberately make no claim of server-side blocking. */
export const readingCopy = {
  hide: '이 작성자의 글 숨기기',
  heading: '숨긴 작성자',
  close: '숨긴 작성자 관리 닫기',
  scope:
    '이 작성자의 불러온 글을 타임라인·받은 답글·검색·저장·대화에서 숨겨요. 저장 링크와 초안은 남아요. 이 브라우저의 현재 계정에만 적용되며, 서버 차단·전달 중지·다른 기기와의 동기화는 하지 않아요.',
  unloadedScope: '아직 불러오지 않은 저장 링크는 작성자를 알 수 없어 그대로 표시해요.',
  demoScope: '둘러보기에서 숨김은 메모리에만 남아요. 나가거나 새로고침하면 초기화돼요.',
  empty: '숨긴 작성자가 없어요.',
  hiddenEmpty: {
    heading: '숨김 설정으로 글이 보이지 않아요',
    body: '이 목록에 맞는 불러온 글이 있지만 작성자를 숨겨 두었어요. 숨김 설정에서 다시 표시할 수 있어요. 저장한 링크와 작성 중인 글은 그대로 남아 있어요.',
  },
  manageEmpty: '숨김 설정 확인',
  manage: (count: number) => `숨긴 작성자 ${count}명 관리`,
  restore: (name: string) => `${name} 숨기기 취소`,
  hidden: (count: number) => `작성자 ${count}명 숨김`,
  hiddenParent: '숨긴 작성자의 글이에요',
  persisted: '이 작성자의 글을 숨겼어요. 이 브라우저의 현재 계정에만 적용돼요.',
  temporary: '브라우저 저장소를 사용할 수 없어 이번 연결에만 숨김 변경을 적용했어요.',
  demo: '이 작성자의 글을 숨겼어요. 둘러보기를 나가거나 새로고침하면 초기화돼요.',
  restored: '이 작성자의 글을 다시 표시해요.',
  restoredDemo: '이 작성자의 글을 다시 표시해요. 둘러보기의 변경은 메모리에만 남아요.',
};
