import type { AccountDiscoveryState } from '../application/account-discovery';

/** URL input follows the existing local inspection path, never a network lookup. */
export const usesActorUrl = (input: string): boolean => /^[a-z][a-z\d+.-]*:/i.test(input.trim());

export const discoveryCopy = {
  input: '팔로우할 계정 주소',
  placeholder: '@alice@social.example 또는 https://…',
  help: '@이름@서버로 찾거나 ActivityPub 계정 주소를 직접 입력하세요.',
  privacy: '찾기를 누르면 해당 서버에 공개 계정 주소를 조회해요. 내 토큰은 보내지 않아요.',
  find: '계정 찾기',
  finding: '계정 주소를 찾는 중…',
  found: '서버가 알려준 계정 주소예요. 이름·소개나 본인 여부를 확인한 결과는 아니에요.',
  firstHeading: '첫 사람을 팔로우해 보세요',
  firstBody:
    '아는 사람의 @이름@서버로 찾아보세요. 승인 후 서버가 전달한 새 글을 여기에서 읽을 수 있어요.',
  firstAction: '팔로우할 사람 찾기',
  errors: {
    'invalid-handle': '@이름@서버를 입력하거나 정확한 ActivityPub 계정 주소를 사용해 주세요.',
    unavailable:
      '계정 주소를 조회하지 못했어요. 연결이나 서버의 브라우저 조회 허용 설정을 확인하거나, ActivityPub 계정 주소를 직접 입력해 주세요.',
    'not-found':
      '서버에서 이 아이디의 계정 주소를 찾지 못했어요. 입력을 확인하거나 ActivityPub 계정 주소를 직접 입력해 주세요.',
    'invalid-response':
      '서버 응답에서 요청한 아이디의 계정 주소를 하나로 확인하지 못했어요. ActivityPub 계정 주소를 직접 입력해 주세요.',
    'too-large':
      '서버 응답이 너무 커서 조회를 중단했어요. ActivityPub 계정 주소를 직접 입력해 주세요.',
  },
};
export const discoveryErrorText = (state?: AccountDiscoveryState): string =>
  state?.error ? discoveryCopy.errors[state.error] : '';
