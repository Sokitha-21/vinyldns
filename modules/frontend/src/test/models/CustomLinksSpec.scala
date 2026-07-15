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

package models

import com.typesafe.config.ConfigFactory
import org.junit.runner.RunWith
import org.specs2.mutable.Specification
import org.specs2.runner.JUnitRunner
import play.api.Configuration

@RunWith(classOf[JUnitRunner])
class CustomLinksSpec extends Specification {

  "CustomLinks" should {
    "load links from configuration" in {
      val raw = ConfigFactory.parseString(
        """
          |links = [
          |  {
          |    displayOnSidebar    = true
          |    displayOnLoginScreen = false
          |    title               = "VinylDNS Docs"
          |    href                = "http://docs.example.com"
          |    icon                = "book"
          |  },
          |  {
          |    displayOnSidebar    = false
          |    displayOnLoginScreen = true
          |    title               = "Support"
          |    href                = "http://support.example.com"
          |    icon                = "help"
          |  }
          |]
          |""".stripMargin
      )
      val config = Configuration(raw)
      val customLinks = CustomLinks(config)

      customLinks.links must haveSize(2)
      customLinks.links.head.title mustEqual "VinylDNS Docs"
      customLinks.links.head.displayOnSidebar mustEqual true
      customLinks.links.head.displayOnLoginScreen mustEqual false
      customLinks.links.head.href mustEqual "http://docs.example.com"
      customLinks.links.head.icon mustEqual "book"
      customLinks.links(1).title mustEqual "Support"
      customLinks.links(1).displayOnLoginScreen mustEqual true
    }

    "return empty list when no links are configured" in {
      val config = Configuration.empty
      val customLinks = CustomLinks(config)
      customLinks.links must beEmpty
    }

    "CustomLink case class holds all fields correctly" in {
      val link = CustomLink(
        displayOnSidebar = true,
        displayOnLoginScreen = false,
        title = "Test",
        href = "http://test.com",
        icon = "star"
      )
      link.displayOnSidebar mustEqual true
      link.displayOnLoginScreen mustEqual false
      link.title mustEqual "Test"
      link.href mustEqual "http://test.com"
      link.icon mustEqual "star"
    }
  }
}
