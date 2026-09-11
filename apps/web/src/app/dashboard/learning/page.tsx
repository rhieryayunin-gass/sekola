import { LearningManager } from "../../../components/learning/learning-manager";
import { ModulePage } from "../../../components/layout/module-page";
import { LearningMediaLink } from "../../../components/media/learning-media-link";
export const metadata = { title: "Learning" };
export default function Page() {
  return <ModulePage name="learning" title="learning" description="learningDesc"><LearningMediaLink/><LearningManager/></ModulePage>;
}
