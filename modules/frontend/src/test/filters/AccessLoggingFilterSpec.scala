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

package filters

import akka.actor.ActorSystem
import akka.stream.ActorMaterializer
import org.junit.runner.RunWith
import org.specs2.mutable.Specification
import org.specs2.runner.JUnitRunner
import play.api.mvc.{Result, Results}
import play.api.test.FakeRequest
import play.api.test.Helpers._

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

@RunWith(classOf[JUnitRunner])
class AccessLoggingFilterSpec extends Specification {

  implicit val system: ActorSystem = ActorSystem("AccessLoggingFilterSpec")
  implicit val mat: ActorMaterializer = ActorMaterializer()

  "AccessLoggingFilter" should {
    "pass the request through and return the result for a non-asset path" in {
      val filter = new AccessLoggingFilter()
      val next: play.api.mvc.RequestHeader => Future[Result] = _ => Future.successful(Results.Ok("ok"))
      val request = FakeRequest(GET, "/api/zones")
      val result = filter.apply(next)(request)
      status(result) mustEqual OK
    }

    "pass through requests for /public without logging" in {
      val filter = new AccessLoggingFilter()
      val next: play.api.mvc.RequestHeader => Future[Result] = _ => Future.successful(Results.Ok("static"))
      val request = FakeRequest(GET, "/public/assets/index.js")
      val result = filter.apply(next)(request)
      status(result) mustEqual OK
    }

    "pass through requests for /assets without logging" in {
      val filter = new AccessLoggingFilter()
      val next: play.api.mvc.RequestHeader => Future[Result] = _ => Future.successful(Results.Ok("asset"))
      val request = FakeRequest(GET, "/assets/index.css")
      val result = filter.apply(next)(request)
      status(result) mustEqual OK
    }
  }
}
