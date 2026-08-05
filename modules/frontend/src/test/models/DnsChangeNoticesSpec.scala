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
class DnsChangeNoticesSpec extends Specification {

  "DnsChangeNotices" should {
    "load a single notice from config" in {
      val raw = ConfigFactory.parseString(
        """
          |notices = [
          |  {
          |    status    = "Complete"
          |    alertType = "success"
          |    text      = "Change completed successfully."
          |    hrefText  = "View details"
          |    href      = "http://example.com"
          |  }
          |]
          |""".stripMargin
      )
      val config = Configuration(raw)
      val notices = config.get[DnsChangeNotices]("notices")
      val json = notices.notices.toString()

      json must contain("Complete")
      json must contain("success")
      json must contain("Change completed successfully.")
      json must contain("View details")
      json must contain("http://example.com")
    }

    "load a notice with omitted optional fields using defaults" in {
      val raw = ConfigFactory.parseString(
        """
          |notices = [
          |  {
          |    status    = "Failed"
          |    alertType = "danger"
          |    text      = "Change failed."
          |  }
          |]
          |""".stripMargin
      )
      val config = Configuration(raw)
      val notices = config.get[DnsChangeNotices]("notices")
      val json = notices.notices.toString()

      json must contain("Failed")
      json must contain("danger")
      json must contain("Change failed.")
    }

    "formatDnsChangeNotice constructs a DnsChangeNotice correctly" in {
      val raw = ConfigFactory.parseString(
        """
          |status    = "PendingReview"
          |alertType = "warning"
          |text      = "Pending manual review."
          |hrefText  = "Learn more"
          |href      = "http://docs.example.com"
          |""".stripMargin
      )
      val notice = DnsChangeNotices.formatDnsChangeNotice(raw)

      notice.status mustEqual DnsChangeStatus.PendingReview
      notice.alertType mustEqual DnsChangeNoticeType.warning
      notice.text mustEqual "Pending manual review."
      notice.hrefText mustEqual "Learn more"
      notice.href mustEqual "http://docs.example.com"
    }

    "DnsChangeStatus enumeration contains all expected values" in {
      DnsChangeStatus.values must contain(DnsChangeStatus.Complete)
      DnsChangeStatus.values must contain(DnsChangeStatus.Failed)
      DnsChangeStatus.values must contain(DnsChangeStatus.PendingReview)
      DnsChangeStatus.values must contain(DnsChangeStatus.Cancelled)
      DnsChangeStatus.values must contain(DnsChangeStatus.PartialFailure)
      DnsChangeStatus.values must contain(DnsChangeStatus.Scheduled)
      DnsChangeStatus.values must contain(DnsChangeStatus.Rejected)
    }

    "DnsChangeNoticeType enumeration contains all expected values" in {
      DnsChangeNoticeType.values must contain(DnsChangeNoticeType.info)
      DnsChangeNoticeType.values must contain(DnsChangeNoticeType.success)
      DnsChangeNoticeType.values must contain(DnsChangeNoticeType.warning)
      DnsChangeNoticeType.values must contain(DnsChangeNoticeType.danger)
    }
  }
}
