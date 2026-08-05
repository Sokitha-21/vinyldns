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

import org.junit.runner.RunWith
import org.specs2.mutable.Specification
import org.specs2.runner.JUnitRunner
import play.api.Configuration

@RunWith(classOf[JUnitRunner])
class MetaSpec extends Specification {

  "Meta.apply" should {
    "build Meta from full configuration" in {
      val config = Configuration.from(
        Map(
          "vinyldns.version"                                         -> "1.2.3",
          "shared-display-enabled"                                   -> true,
          "batch-change-limit"                                       -> 50,
          "default-ttl"                                              -> 3600L,
          "manual-batch-review-enabled"                              -> true,
          "scheduled-changes-enabled"                                -> true,
          "portal.vinyldns.url"                                      -> "http://vinyldns.example.com",
          "api.limits.membership-routing-max-groups-list-limit"      -> 2000
        )
      )
      val meta = Meta(config)

      meta.version mustEqual "1.2.3"
      meta.sharedDisplayEnabled mustEqual true
      meta.batchChangeLimit mustEqual 50
      meta.defaultTtl mustEqual 3600L
      meta.manualBatchChangeReviewEnabled mustEqual true
      meta.scheduledBatchChangesEnabled mustEqual true
      meta.portalUrl mustEqual "http://vinyldns.example.com"
      meta.maxGroupItemsDisplay mustEqual 2000
    }

    "use default values when optional config keys are absent" in {
      val config = Configuration.from(
        Map("portal.vinyldns.url" -> "http://vinyldns.example.com")
      )
      val meta = Meta(config)

      meta.version mustEqual "unknown"
      meta.sharedDisplayEnabled mustEqual false
      meta.batchChangeLimit mustEqual 1000
      meta.defaultTtl mustEqual 7200L
      meta.manualBatchChangeReviewEnabled mustEqual false
      meta.scheduledBatchChangesEnabled mustEqual false
      meta.maxGroupItemsDisplay mustEqual 3000
    }
  }
}
