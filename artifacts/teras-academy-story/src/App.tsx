import VideoTemplate from '@/components/video/VideoTemplate';
import { VideoWithControls } from '@/lib/video';

export default function App() {
  return (
    <VideoWithControls>
      <VideoTemplate />
    </VideoWithControls>
  );
}
