import scala.sys.process.Process
import play.sbt.PlayRunHook
import sbt.File

/** PlayRunHook that builds the React frontend (via deploy-to-frontend.sh) before
  * Play starts. Registered in build.sbt frontendSettings via
  * `PlayKeys.playRunHooks += FrontendBuildHook(baseDirectory.value)`.
  */
object FrontendBuildHook {
  def apply(base: File): PlayRunHook = {
    object ReactBuild extends PlayRunHook {
      override def beforeStarted(): Unit = {
        Process("./deploy-to-frontend.sh", base).!
      }
    }
    ReactBuild
  }
}
