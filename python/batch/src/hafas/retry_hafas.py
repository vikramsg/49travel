import abc
import json
from typing import Dict, Optional

import pytz
import requests
from pyhafas.profile import ProfileInterface
from pyhafas.profile.base.helper.date_time import BaseDateTimeHelper
from pyhafas.profile.base.helper.format_products_filter import (
    BaseFormatProductsFilterHelper,
)
from pyhafas.profile.base.helper.parse_leg import BaseParseLegHelper
from pyhafas.profile.base.helper.parse_lid import BaseParseLidHelper
from pyhafas.profile.base.helper.request import BaseRequestHelper
from pyhafas.profile.base.mappings.error_codes import BaseErrorCodesMapping
from pyhafas.profile.base.requests.journey import BaseJourneyRequest
from pyhafas.profile.base.requests.journeys import BaseJourneysRequest
from pyhafas.profile.base.requests.location import BaseLocationRequest
from pyhafas.profile.base.requests.station_board import BaseStationBoardRequest
from pyhafas.profile.base.requests.trip import BaseTripRequest
from pyhafas.types.hafas_response import HafasResponse
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from src.hafas.fptf import Remark

# FIXME: This whole file is not required but pyhafas needs to be updated
# on pip


class ParseRemarkHelperInterface(abc.ABC):
    @abc.abstractmethod
    def parse_remark(self, remark: dict, common: dict) -> Remark:
        """
        Parses Remark HaFAS returns into Remark object

        :param remark: Remark object given back by HaFAS
        :param common:  Common object given back by HaFAS
        :return: Parsed Remark object
        """
        pass


class BaseParseRemarkHelper(ParseRemarkHelperInterface):
    def parse_remark(self: ProfileInterface, remark: dict, common: dict) -> Remark:
        """
        Parses Remark HaFAS returns into Remark object

        :param remark: Remark object given back by HaFAS
        :param common: Common object given back by HaFAS
        :return: Parsed Remark object
        """

        rem = Remark(
            remark_type=remark.get("type"),
            code=remark.get("code") if remark.get("code") != "" else None,
            subject=remark.get("txtS") if remark.get("txtS") != "" else None,
            text=remark.get("txtN") if remark.get("txtN") != "" else None,
            priority=remark.get("prio"),
            trip_id=remark.get("jid"),
        )
        # print(rem, remark)
        return rem


class DBRetryRequestHelper(BaseRequestHelper):
    tenacity_multiplier = 20
    tenacity_retry_attempts = 4

    @retry(
        wait=wait_exponential(multiplier=tenacity_multiplier),
        stop=stop_after_attempt(tenacity_retry_attempts),
        retry=retry_if_exception_type(requests.ConnectionError),
    )
    def request(self: ProfileInterface, body: Dict) -> HafasResponse:
        """
        Sends the request and does a basic parsing of the response and error handling

        :param body: Reqeust body as dict (without the `requestBody` of the profile)
        :return: HafasRespone object or Exception when HaFAS response returns an error
        """
        data = {"svcReqL": [body]}
        data.update(self.requestBody)
        data = json.dumps(data)  # type: ignore

        print("Requesting")
        res = requests.post(
            self.url_formatter(data),
            data=data,
            headers={"User-Agent": self.userAgent, "Content-Type": "application/json"},
        )
        return HafasResponse(res, BaseErrorCodesMapping)


class DBRetryProfile(
    DBRetryRequestHelper,
    BaseFormatProductsFilterHelper,
    BaseParseLidHelper,
    BaseDateTimeHelper,
    BaseParseLegHelper,
    BaseParseRemarkHelper,
    BaseLocationRequest,
    BaseJourneyRequest,
    BaseJourneysRequest,
    BaseStationBoardRequest,
    BaseTripRequest,
    ProfileInterface,
):
    """
    Profile of the HaFAS of Deutsche Bahn (DB) - German Railway - Regional and long-distance trains throughout Germany
    """

    addMicMac: bool = False

    baseUrl = "https://reiseauskunft.bahn.de/bin/mgate.exe"
    defaultUserAgent = "DB Navigator/19.10.04 (iPhone; iOS 13.1.2; Scale/2.00)"

    salt = "bdI8UVj40K5fvxwf"
    addChecksum = True

    locale = "de-DE"
    timezone = pytz.timezone("Europe/Berlin")

    requestBody = {
        "client": {"id": "DB", "v": "20100000", "type": "IPH", "name": "DB Navigator"},
        "ext": "DB.R21.12.a",
        "ver": "1.15",
        "auth": {"type": "AID", "aid": "n91dB8Z77MLdoR0K"},
    }

    availableProducts = {
        "long_distance_express": [1],  # ICE
        "long_distance": [2],  # IC/EC
        "regional_express": [4],  # RE/IR
        "regional": [8],  # RB
        "suburban": [16],  # S
        "bus": [32],  # BUS
        "ferry": [64],  # F
        "subway": [128],  # U
        "tram": [256],  # T
        "taxi": [512],  # Group Taxi
    }

    defaultProducts = [
        "long_distance_express",
        "long_distance",
        "regional_express",
        "regional",
        "suburban",
        "bus",
        "ferry",
        "subway",
        "tram",
        "taxi",
    ]

    def __init__(self, ua: Optional[str] = None) -> None:
        if ua:
            self.userAgent = ua
        else:
            self.userAgent = self.defaultUserAgent
