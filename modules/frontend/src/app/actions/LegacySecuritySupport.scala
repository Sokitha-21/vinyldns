/*
 * Copyright 2018 Comcast Cable Communications Management, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package actions
import controllers.{OidcAuthenticator, UserAccountAccessor, VinylDNS}
import javax.inject.Inject
import org.slf4j.LoggerFactory
import play.api.{Configuration, Environment}
import play.api.mvc._
import play.filters.csrf.CSRF

import scala.io.Source

class LegacySecuritySupport @Inject() (
    components: ControllerComponents,
    userAccountAccessor: UserAccountAccessor,
    configuration: Configuration,
    oidcAuthenticator: OidcAuthenticator,
    env: Environment
) extends AbstractController(components)
    with SecuritySupport {
  private val logger = LoggerFactory.getLogger(classOf[LegacySecuritySupport])

  /**
   * Reads public/index.html, injects CSRF token and optional login-error meta.
   * Tries classpath first (production JAR), then filesystem (dev mode).
   */
  private def serveReactApp(errorMsg: String = "")(implicit request: Request[AnyContent]): Result = {
    val csrfToken = CSRF.getToken.map(_.value).getOrElse("")
    val contentOpt: Option[String] =
      env.resourceAsStream("public/index.html")
        .orElse {
          val f = new java.io.File(env.rootPath, "public/index.html")
          if (f.exists()) Some(new java.io.FileInputStream(f)) else None
        }
        .map { is =>
          val src = Source.fromInputStream(is, "UTF-8")
          try src.mkString finally src.close()
        }
    contentOpt match {
      case Some(content) =>
        val errorMeta = if (errorMsg.nonEmpty)
          s"""\n    <meta id="login-error" content="${errorMsg.replace("\"", "&quot;")}"/>"""
        else ""
        val html = content.replace("<head>", s"""<head>\n    <meta id="csrf" name="csrf-token" content="$csrfToken"/>$errorMeta""")
        Ok(html).as("text/html")
      case None =>
        logger.warn("React index.html not found — run: npm run build")
        ServiceUnavailable("React app not built. Run: npm run build").as("text/plain")
    }
  }

  def frontendAction: FrontendActionBuilder =
    new LegacyFrontendAction(
      userAccountAccessor.get,
      oidcAuthenticator,
      components.parsers.anyContent
    )

  def apiAction: ApiActionBuilder =
    new LegacyApiAction(userAccountAccessor.get, oidcAuthenticator, components.parsers.anyContent)

  def loginPage(): Action[AnyContent] = Action {
    implicit request =>
      if (oidcAuthenticator.oidcEnabled) {
        request.session.get(VinylDNS.ID_TOKEN) match {
          case Some(_) => Redirect(request.getQueryString("target").getOrElse("/index"))
          case None =>
            logger.info(s"No ${VinylDNS.ID_TOKEN} in session; Initializing oidc login")
            Redirect(oidcAuthenticator.getCodeCall(request.uri).toString, 302)
        }
      } else {
        request.session.get("username") match {
          case Some(_) => Redirect("/index")
          case None =>
            val flash = request.flash
            logger.info(s"No session, serving login page. Flash: $flash")
            val errorMsg = VinylDNS.Alerts.fromFlash(flash) match {
              case Some(VinylDNS.Alert("danger", message)) => message
              case _ => ""
            }
            serveReactApp(errorMsg)
        }
      }
  }

  private def getLoggedInUser(request: RequestHeader) =
    if (oidcAuthenticator.oidcEnabled) {
      request.session
        .get(VinylDNS.ID_TOKEN)
        .flatMap {
          oidcAuthenticator.getValidUsernameFromToken
        }
    } else {
      request.session.get("username")
    }.getOrElse("No user in session")

  def logout(): Action[AnyContent] = Action { implicit request =>
    logger.info(s"Initializing logout for user [${getLoggedInUser(request)}]")
    if (oidcAuthenticator.oidcEnabled) {
      Redirect(oidcAuthenticator.oidcLogoutUrl).withNewSession
    } else {
      Redirect("/login").withNewSession
    }
  }

  def noAccess(): Action[AnyContent] = Action {
    implicit request =>
      logger.info(s"User account for '${getLoggedInUser(request)}' is locked.")
      serveReactApp("Account locked. Please contact your VinylDNS administrators.")
  }
}
