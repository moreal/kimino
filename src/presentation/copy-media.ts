import type { ImageProblem } from '../domain/images';
import type { ImageUploadState } from '../application/image-types';

export const mediaCopy = {
  connectionOptions: '이미지 게시 설정',
  editPreserved: '기존 이미지는 그대로 유지해요. 여기서는 본문과 경고 문구만 수정해요.',
  enable: 'ONI 이미지 게시 사용',
  enableHelp:
    'ONI 서버의 이미지 게시 방식으로 연결해요. 다른 C2S 서버에서는 지원되지 않을 수 있어요.',
  legend: '이미지 첨부',
  helpHeading: '이미지 첨부 안내',
  add: '이미지 추가',
  limits: 'PNG, JPEG, WebP · 최대 4장 · 한 장당 5 MiB',
  unsupported:
    '이미지를 게시하려면 연결 화면에서 “ONI 이미지 게시 사용”을 켜 주세요. ONI 서버에서만 확인된 기능이에요.',
  scope:
    '이미지는 공개와 조용히 공개 글에만 첨부할 수 있어요. 이 글의 공개 범위는 그대로 유지돼요.',
  beforeSubmit:
    '선택한 이미지는 게시할 때 업로드해요. 업로드된 이미지는 글 게시가 실패하거나 취소돼도 공개된 채 남을 수 있어요. 초안에서 제거해도 서버의 이미지는 삭제되지 않아요.',
  beforePrivateSubmit:
    '이미지도 표시된 글의 수신 범위로 업로드해요. 글 게시가 실패하거나 취소돼도 업로드된 이미지는 그 범위에서 남을 수 있어요. 초안에서 제거해도 서버의 이미지는 삭제되지 않아요.',
  altHelp: '이미지에서 중요한 내용을 설명해 주세요. 의미 없는 장식이라면 비워 두어도 돼요.',
  altLabel: (index: number) => `이미지 ${index} 대체 텍스트`,
  preview: (index: number) => `선택한 이미지 ${index} 미리보기`,
  remove: (index: number) => `이미지 ${index} 제거`,
  list: '선택한 이미지',
  count: (count: number) => `${count}/4장`,
  reading: '이미지를 읽는 중…',
  readFailed: '이미지를 읽지 못했어요. 파일을 다시 선택해 주세요.',
  resolve: '업로드 확인',
  resolving: '업로드 확인 중…',
  resolveFailed:
    '업로드 정보를 아직 확인하지 못했어요. 잠시 후 다시 확인할 수 있어요. 이미지는 다시 업로드하지 않아요.',
  local: '선택됨 · 아직 업로드하지 않았어요',
  uploading: '이미지 업로드 중…',
  ready: '업로드됨 · 다시 게시해도 이 이미지를 재사용해요',
  unresolved: '업로드는 접수됐지만 이미지 정보를 확인하지 못했어요.',
  noLocation:
    '업로드는 접수됐지만 확인 주소가 없어 여기서 계속할 수 없어요. 서버에서 업로드 상태를 확인해 주세요.',
  uncertain:
    '업로드 결과를 알 수 없어요. 중복 게시를 막기 위해 다시 업로드하지 않아요. 서버에서 업로드 상태를 확인해 주세요.',
};

export function imageProblemText(problem: ImageProblem): string {
  switch (problem) {
    case 'type':
      return 'PNG, JPEG, WebP 이미지만 선택할 수 있어요.';
    case 'size':
      return '이미지는 한 장당 5 MiB 이하여야 해요.';
    case 'data':
      return '이미지 파일을 확인할 수 없어요. 다른 파일을 선택해 주세요.';
    case 'count':
      return '이미지는 최대 4장까지 첨부할 수 있어요.';
    case 'alt':
      return '대체 텍스트는 이미지마다 1,500자 이하여야 해요.';
  }
}

export function imageUploadText(upload?: ImageUploadState): string {
  if (!upload) return mediaCopy.local;
  if (upload.phase === 'unresolved')
    return upload.location ? mediaCopy.unresolved : mediaCopy.noLocation;
  return mediaCopy[upload.phase];
}
