import studybuddyIcon from '@/assets/studybuddy-icon.png';
/** Reuses the approved StudyBuddy application mark. */
export function BrandLogo({ size = 18 }: { size?: number }) {
  return <img src={studybuddyIcon} width={size} height={size} className="block shrink-0 object-contain" alt="StudyBuddy" />;
}
