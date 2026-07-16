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

import java.io.ByteArrayInputStream
import org.junit.runner.RunWith
import org.specs2.mutable.Specification
import org.specs2.runner.JUnitRunner
import com.amazonaws.http.HttpMethodName

@RunWith(classOf[JUnitRunner])
class VinylRequestSpec extends Specification {

  "SignableVinylDNSRequest" should {
    "expose the correct HTTP method" in {
      val req = VinylDNSRequest("GET", "http://localhost:9001", "zones")
      val signable = new SignableVinylDNSRequest(req)
      signable.getHttpMethod mustEqual HttpMethodName.GET
    }

    "expose the correct resource path" in {
      val req = VinylDNSRequest("POST", "http://localhost:9001", "zones/batchrecordchanges")
      val signable = new SignableVinylDNSRequest(req)
      signable.getResourcePath mustEqual "zones/batchrecordchanges"
    }

    "expose the correct endpoint URI" in {
      val req = VinylDNSRequest("GET", "http://localhost:9001", "groups")
      val signable = new SignableVinylDNSRequest(req)
      signable.getEndpoint.toString mustEqual "http://localhost:9001"
    }

    "add and retrieve headers" in {
      val req = VinylDNSRequest("GET", "http://localhost:9001", "zones")
      val signable = new SignableVinylDNSRequest(req)
      signable.addHeader("X-Custom", "value")
      signable.getHeaders.get("X-Custom") mustEqual "value"
    }

    "addParameter adds key/value to parameters" in {
      import scala.collection.JavaConverters._
      val req = VinylDNSRequest("GET", "http://localhost:9001", "zones")
      val signable = new SignableVinylDNSRequest(req)
      signable.addParameter("maxItems", "100")
      signable.addParameter("maxItems", "200")
      signable.getParameters.get("maxItems").asScala must contain("100")
      signable.getParameters.get("maxItems").asScala must contain("200")
    }

    "setContent replaces the content stream" in {
      val req = VinylDNSRequest("POST", "http://localhost:9001", "zones", Some("""{"name":"test"}"""))
      val signable = new SignableVinylDNSRequest(req)
      val newContent = new ByteArrayInputStream("replaced".getBytes("UTF-8"))
      signable.setContent(newContent)
      signable.getContent mustEqual newContent
    }

    "getTimeOffset returns 0" in {
      val req = VinylDNSRequest("GET", "http://localhost:9001", "zones")
      val signable = new SignableVinylDNSRequest(req)
      signable.getTimeOffset mustEqual 0
    }

    "getReadLimitInfo returns -1 read limit" in {
      val req = VinylDNSRequest("GET", "http://localhost:9001", "zones")
      val signable = new SignableVinylDNSRequest(req)
      signable.getReadLimitInfo.getReadLimit mustEqual -1
    }

    "getOriginalRequestObject returns the original VinylDNSRequest" in {
      val req = VinylDNSRequest("GET", "http://localhost:9001", "zones")
      val signable = new SignableVinylDNSRequest(req)
      signable.getOriginalRequestObject mustEqual req
    }

    "getContentUnwrapped returns the same stream as getContent" in {
      val req = VinylDNSRequest("GET", "http://localhost:9001", "zones")
      val signable = new SignableVinylDNSRequest(req)
      signable.getContentUnwrapped mustEqual signable.getContent
    }
  }
}
