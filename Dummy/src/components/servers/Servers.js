import React from "react";
import Nikeguy from "../images/nike-just-do-it (2).png";
import styled from "styled-components";
import discordlogo from "../images/Discordlogo.svg";
import { Link } from "react-router-dom";
import newimage from "../images/DiscordLogoLong.svg";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ui/tooltip";
import dummyImage from "../images/nike-just-do-it (2).png"

const Servers = ({ value }) => {
  console.log(value.Serverpic);

  return (
    <>
      <TooltipProvider
        delayDuration={0}
        skipDelayDuration={0}
        style={{ zIndex: "45000" }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Link to={`/channel/${value._id}/${value.defaultChannel}`}>
              <Cover>
              <img src={{dummyImage}} />
                {/* {value.Serverpic ? (
                  <img
                    src={`https://bucket-88dwgz.s3.ap-south-1.amazonaws.com/bucket-88dwgz/${value.Serverpic}`}
                    onError={(e) => {
                      e.onerror = null;
                      e.target.src = newimage;
                     }}
                  />
                ) : (
                  <img src="https://bucket-88dwgz.s3.ap-south-1.amazonaws.com/discoddefault.jpg" />
                )} */}
              </Cover>
            </Link>
          </TooltipTrigger>
          <StyledTooltipContent side="right" sideOffset={10}>
            <p>{value.serverName}</p>
          </StyledTooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );
};

export default Servers;

const Cover = styled.div`
  width: 3rem;
  height: 3rem;

  img {
    width: 100%;
    height: 3rem;

    object-fit: cover;

    border-radius: 2rem;
    cursor: pointer;
  }
`;

const StyledTooltipContent = styled(TooltipContent)`
  background-color: #111111;
  color: #fff;
  padding-inline: 0.5rem;
  padding-block: 0.25rem;
  border-radius: 0.25rem;
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.1);
  font-size: 0.875rem;
  min-width: 10rem;
  text-align: start;
  display: flex;
  align-items: center;
  padding-left: 1.5rem;
  font-size: 1rem;
  min-height: 2.5rem;
  z-index: 5000; /* Ensure this is higher than the server bar */
`;
